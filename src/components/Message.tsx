import { memo } from "preact/compat"
import { useLayoutEffect, useRef, useState } from "preact/hooks"
import { Icon } from "./Icon"
import { CopyButton, Spinner } from "./ui"
import { renderMarkdown } from "../lib/markdown"
import { copyText, messageToMarkdown, toolSummary } from "../lib/export"
import { clockTime, compactNumber, money } from "../lib/format"
import type { AssistantMessage, Message, NoticeMessage, ToolPart, UserMessage } from "../lib/types"
import { prefs } from "../state/store"

type Actions = {
  onRevert?: (id: string) => void
  onFork?: (id: string) => void
  onChanges?: (turnStart: string) => void
}

// turnFiles/turnStart: on the last assistant message of a turn, how many files the turn changed and which user
// message started it, for the "files changed" shortcut.
export const MessageView = memo(function MessageView(props: { message: Message; reverted?: boolean; turnFiles?: number; turnStart?: string } & Actions) {
  const { message } = props
  if (message.kind === "user") return <UserView m={message} reverted={props.reverted} onRevert={props.onRevert} onFork={props.onFork} />
  if (message.kind === "assistant")
    return <AssistantView m={message} reverted={props.reverted} turnFiles={props.turnFiles} turnStart={props.turnStart} onChanges={props.onChanges} />
  return <NoticeView m={message} />
})

function UserView({ m, reverted, onRevert, onFork }: { m: UserMessage; reverted?: boolean } & Actions) {
  return (
    <article class={`msg user${m.pending ? " pending" : ""}${reverted ? " reverted" : ""}`} data-id={m.id}>
      <div class="bubble">
        <div class="user-text">{m.text}</div>
        {m.attachments.length > 0 && (
          <div class="attachments">
            {m.attachments.map((a, i) => (
              <span key={i} class="chip">
                <Icon name={a.mime.startsWith("image/") ? "image" : "file"} size={14} /> {a.name}
              </span>
            ))}
          </div>
        )}
      </div>
      <div class="msg-actions">
        {m.pending ? (
          <span class="muted tiny">
            <Spinner size={10} /> queued
          </span>
        ) : (
          <span class="muted tiny">{clockTime(m.created)}</span>
        )}
        <CopyButton text={() => m.text} onCopy={copyText} />
        {onRevert && !m.pending && !reverted && (
          <button class="icon-btn small" title="Revert to before this message" aria-label="Revert to here" onClick={() => onRevert(m.id)}>
            <Icon name="undo" size={15} />
          </button>
        )}
        {onFork && !m.pending && (
          <button class="icon-btn small" title="Fork a new session from here" aria-label="Fork from here" onClick={() => onFork(m.id)}>
            <Icon name="fork" size={15} />
          </button>
        )}
      </div>
    </article>
  )
}

function AssistantView({
  m,
  reverted,
  turnFiles,
  turnStart,
  onChanges,
}: { m: AssistantMessage; reverted?: boolean; turnFiles?: number; turnStart?: string; onChanges?: (turnStart: string) => void }) {
  const hasText = m.parts.some((p) => p.type === "text" && p.text.trim())
  const streaming = m.parts.some((p) => (p.type === "text" || p.type === "reasoning") && p.streaming)
  return (
    <article class={`msg assistant${reverted ? " reverted" : ""}`} data-id={m.id}>
      {m.parts.map((part) => {
        if (part.type === "text") return part.text ? <Markdown key={part.key} text={part.text} streaming={part.streaming} /> : null
        if (part.type === "reasoning") return part.text.trim() ? <Reasoning key={part.key} text={part.text} streaming={part.streaming} /> : null
        return <ToolCard key={part.key} tool={part} />
      })}
      {m.error && (
        <div class="note error small">
          <Icon name="alert" size={14} /> {m.error}
        </div>
      )}
      {(hasText || m.completed) && !streaming && (
        <div class="msg-actions">
          <span class="muted tiny">
            {[
              m.model?.id,
              m.tokens ? `${compactNumber(m.tokens.input)} in · ${compactNumber(m.tokens.output)} out` : undefined,
              m.cost ? money(m.cost) : undefined,
              m.completed ? clockTime(m.completed) : undefined,
            ]
              .filter(Boolean)
              .join(" · ")}
          </span>
          {hasText && <CopyButton text={() => messageToMarkdown(m)} onCopy={copyText} />}
          {turnFiles && turnStart && onChanges ? (
            <button class="btn ghost small changes-chip" onClick={() => onChanges(turnStart)}>
              <Icon name="file" size={14} /> {turnFiles} file{turnFiles === 1 ? "" : "s"} changed
            </button>
          ) : null}
        </div>
      )}
    </article>
  )
}

// Rendered (sanitized) Markdown. Once the text stops streaming, each code block gets a small header with its
// language and a copy button, so code never hides behind the button.
function Markdown({ text, streaming }: { text: string; streaming?: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  const html = renderMarkdown(text, !streaming)
  useLayoutEffect(() => {
    if (streaming) return
    for (const pre of Array.from(ref.current?.querySelectorAll("pre") ?? [])) {
      if (pre.previousElementSibling?.classList.contains("code-head")) continue
      const code = pre.querySelector("code")
      const head = document.createElement("div")
      head.className = "code-head"
      const lang = document.createElement("span")
      lang.textContent = /language-([\w+#-]+)/.exec(code?.className ?? "")?.[1] ?? ""
      const button = document.createElement("button")
      button.type = "button"
      button.className = "code-copy"
      button.textContent = "Copy"
      button.setAttribute("aria-label", "Copy code")
      button.addEventListener("click", async () => {
        const ok = await copyText(code?.textContent ?? "")
        button.textContent = ok ? "Copied" : "Copy failed"
        setTimeout(() => (button.textContent = "Copy"), 1200)
      })
      head.append(lang, button)
      pre.before(head)
    }
  }, [html, streaming])
  return <div ref={ref} class="md" dangerouslySetInnerHTML={{ __html: html }} />
}

function Reasoning({ text, streaming }: { text: string; streaming?: boolean }) {
  const [open, setOpen] = useState(!!prefs.value.showReasoning)
  return (
    <div class={`reasoning${open ? " open" : ""}`}>
      <button class="reasoning-head" onClick={() => setOpen(!open)} aria-expanded={open}>
        <Icon name="brain" size={14} />
        <span>{streaming ? "Thinking…" : "Thought process"}</span>
        <Icon name={open ? "chevronDown" : "chevronRight"} size={14} />
      </button>
      {open && <div class="reasoning-body">{text}</div>}
    </div>
  )
}

const toolIcons: Record<string, string> = {
  shell: "terminal",
  bash: "terminal",
  read: "file",
  write: "edit",
  edit: "edit",
  patch: "edit",
  glob: "search",
  grep: "search",
  webfetch: "link",
  websearch: "search",
  question: "sparkle",
  subagent: "fork",
  task: "fork",
  todowrite: "check",
}

function prettyInput(tool: ToolPart) {
  if (tool.input && Object.keys(tool.input).length) return JSON.stringify(tool.input, null, 2)
  return tool.inputText ?? ""
}

function DiffView({ oldText, newText }: { oldText: string; newText: string }) {
  const removed = oldText ? oldText.split("\n") : []
  const added = newText ? newText.split("\n") : []
  return (
    <pre class="diff">
      {removed.map((l, i) => (
        <div key={`r${i}`} class="del">
          - {l}
        </div>
      ))}
      {added.map((l, i) => (
        <div key={`a${i}`} class="add">
          + {l}
        </div>
      ))}
    </pre>
  )
}

function ToolBody({ tool }: { tool: ToolPart }) {
  const input = tool.input ?? {}
  const [full, setFull] = useState(false)
  const output = tool.output ?? ""
  const long = output.length > 3000
  if (tool.name === "edit" && typeof input.oldString === "string" && typeof input.newString === "string") {
    return (
      <>
        <DiffView oldText={input.oldString} newText={input.newString} />
        {tool.error && <pre class="tool-error">{tool.error}</pre>}
      </>
    )
  }
  if (tool.name === "write" && typeof input.content === "string") {
    return (
      <>
        <DiffView oldText="" newText={input.content.length > 6000 && !full ? input.content.slice(0, 6000) : input.content} />
        {tool.error && <pre class="tool-error">{tool.error}</pre>}
      </>
    )
  }
  const showInput = !["shell", "bash"].includes(tool.name)
  return (
    <>
      {showInput && prettyInput(tool) && <pre class="tool-input">{prettyInput(tool)}</pre>}
      {output && (
        <pre class="tool-output">
          {long && !full ? output.slice(0, 3000) + "\n…" : output}
        </pre>
      )}
      {long && (
        <button class="btn ghost small" onClick={() => setFull(!full)}>
          {full ? "Show less" : `Show all (${compactNumber(output.length)} chars)`}
        </button>
      )}
      {tool.error && <pre class="tool-error">{tool.error}</pre>}
    </>
  )
}

function ToolCard({ tool }: { tool: ToolPart }) {
  const [open, setOpen] = useState(false)
  const summary = toolSummary(tool)
  const status =
    tool.status === "completed" ? (
      <Icon name="check" size={14} class="ok" />
    ) : tool.status === "error" ? (
      <Icon name="alert" size={14} class="bad" />
    ) : (
      <Spinner size={12} />
    )
  return (
    <div class={`tool ${tool.status}${open ? " open" : ""}`}>
      <button class="tool-head" onClick={() => setOpen(!open)} aria-expanded={open}>
        <Icon name={toolIcons[tool.name] ?? "settings"} size={14} />
        <span class="tool-name">{tool.name}</span>
        <span class="tool-summary ellipsis mono">{summary}</span>
        {status}
      </button>
      {open && (
        <div class="tool-body">
          <ToolBody tool={tool} />
        </div>
      )}
    </div>
  )
}

function NoticeView({ m }: { m: NoticeMessage }) {
  const [open, setOpen] = useState(false)
  return (
    <div class={`notice ${m.tone}`}>
      {m.detail ? (
        <button class="notice-head" onClick={() => setOpen(!open)} aria-expanded={open}>
          <span>{m.text}</span>
          <Icon name={open ? "chevronDown" : "chevronRight"} size={12} />
        </button>
      ) : (
        <span>{m.text}</span>
      )}
      {open && m.detail && <pre class="notice-detail">{m.detail}</pre>}
    </div>
  )
}
