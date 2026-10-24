import { Fragment } from "preact"
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "preact/hooks"
import { Icon } from "./Icon"
import { Spinner } from "./ui"
import { MessageView } from "./Message"
import {
  answerForm,
  answerPermission,
  backend,
  busy,
  changesView,
  commitRevert,
  currentSession,
  currentSessionID,
  currentThread,
  directory,
  dismissForm,
  forkSession,
  forms,
  loadOlder,
  openSession,
  permissions,
  projectLabel,
  retrying,
  revertTo,
  sessionMap,
  undoRevert,
} from "../state/store"
import type { Form, FormField, Message, Permission } from "../lib/types"

export function ChatView() {
  const scroller = useRef<HTMLDivElement>(null)
  const pinned = useRef(true)
  const [showJump, setShowJump] = useState(false)
  const thread = currentThread.value
  const session = currentSession.value
  const sid = currentSessionID.value
  const isBusy = sid ? !!busy.value[sid] : false
  const messages = thread?.messages ?? []
  const turns = turnSummary(messages)
  const revertIndex = session?.revert ? messages.findIndex((m) => m.id === session.revert!.messageID) : -1

  // Follow new output only while the reader is at the bottom; scrolling up to read stops the follow.
  function onScroll() {
    const el = scroller.current
    if (!el) return
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight
    pinned.current = distance < 120
    setShowJump(distance > 400)
  }

  useLayoutEffect(() => {
    const el = scroller.current
    if (el && pinned.current) el.scrollTop = el.scrollHeight
  })

  useEffect(() => {
    pinned.current = true
    const el = scroller.current
    if (el) el.scrollTop = el.scrollHeight
  }, [sid])

  // Opening the on-screen keyboard shrinks the chat; stay on the latest message if the reader was there.
  useEffect(() => {
    const el = scroller.current
    if (!el || typeof ResizeObserver === "undefined") return
    const observer = new ResizeObserver(() => {
      if (pinned.current) el.scrollTop = el.scrollHeight
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const showTurn = useCallback((start: string) => {
    const current = currentSessionID.peek()
    if (current) changesView.value = { sessionID: current, from: start, title: "Changes in this turn" }
  }, [])

  // Stable callbacks keep memoized messages from re-rendering on every streamed delta.
  const fork = useCallback((id: string) => {
    const current = currentSessionID.peek()
    if (current) forkSession(current, id)
  }, [])

  async function older() {
    const el = scroller.current
    if (!el || !sid) return
    const before = el.scrollHeight
    pinned.current = false
    await loadOlder(sid)
    requestAnimationFrame(() => {
      el.scrollTop += el.scrollHeight - before
    })
  }

  return (
    <div class="chat" ref={scroller} onScroll={onScroll}>
      <div class="chat-inner">
        {!sid && <EmptyState />}
        {sid && thread?.loading && !messages.length && (
          <div class="empty">
            <Spinner /> Loading conversation…
          </div>
        )}
        {thread?.older && (
          <button class="btn ghost small load-older" onClick={older} disabled={thread.loadingOlder}>
            {thread.loadingOlder ? <Spinner size={12} /> : <Icon name="arrowUp" size={14} />} Load earlier messages
          </button>
        )}
        {messages.map((m, i) => (
          <Fragment key={m.id}>
            {i === revertIndex && <RevertBanner />}
            <MessageView
              message={m}
              reverted={revertIndex !== -1 && i >= revertIndex}
              onRevert={revertTo}
              onFork={fork}
              turnFiles={turns.get(m.id)?.files}
              turnStart={turns.get(m.id)?.start}
              onChanges={showTurn}
            />
          </Fragment>
        ))}
        {sid && isBusy && (
          <div class="working">
            <Spinner size={14} /> {retrying.value[sid] ? `Retrying: ${retrying.value[sid]}` : "Working…"}
          </div>
        )}
      </div>
      {showJump && (
        <button
          class="jump"
          aria-label="Jump to latest"
          onClick={() => {
            const el = scroller.current
            if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" })
          }}
        >
          <Icon name="arrowDown" />
        </button>
      )}
    </div>
  )
}

// For each turn (a user message and the assistant messages after it), the files changed and where it started,
// keyed by the turn's last assistant message.
function turnSummary(messages: Message[]) {
  const out = new Map<string, { files: number; start: string }>()
  let start: string | undefined
  let files = new Set<string>()
  let last: string | undefined
  const flush = () => {
    if (start && last && files.size) out.set(last, { files: files.size, start })
  }
  for (const m of messages) {
    if (m.kind === "user") {
      flush()
      start = m.id
      files = new Set()
      last = undefined
    } else if (m.kind === "assistant") {
      for (const f of m.files ?? []) files.add(f)
      last = m.id
    }
  }
  flush()
  return out
}

function EmptyState() {
  return (
    <div class="empty-state">
      <img src="./icon.svg" alt="" width={56} height={56} />
      <h2>New session</h2>
      <p class="muted">
        in <strong>{projectLabel(directory.value)}</strong>
      </p>
      <ul class="tips muted small">
        <li>
          Type a message to start. <code>!cmd</code> runs a shell command, <code>/</code> lists commands.
        </li>
        <li>Pick the agent, model and reasoning effort below the input.</li>
        <li>Attach images or files with the paperclip, or paste them.</li>
      </ul>
    </div>
  )
}

function RevertBanner() {
  const session = currentSession.value
  const [showFiles, setShowFiles] = useState(false)
  if (!session?.revert) return null
  const files = session.revert.files
  return (
    <div class="revert-banner" role="status">
      <div class="row wrap">
        <Icon name="undo" />
        <strong class="grow">Reverted to here</strong>
        {files.length > 0 && (
          <button class="btn ghost small" onClick={() => setShowFiles(!showFiles)}>
            {files.length} file{files.length === 1 ? "" : "s"} restored
          </button>
        )}
      </div>
      {showFiles && (
        <ul class="file-list mono small">
          {files.map((f) => (
            <li key={f.file}>
              <span class={`file-status ${f.status}`}>{f.status === "added" ? "A" : f.status === "deleted" ? "D" : "M"}</span> {f.file}
              <span class="muted">
                {" "}
                +{f.additions} −{f.deletions}
              </span>
            </li>
          ))}
        </ul>
      )}
      <p class="muted small">The messages below are hidden from the agent. Sending a new message discards them.</p>
      <div class="row wrap">
        <button class="btn small" onClick={undoRevert}>
          Undo revert
        </button>
        {backend.value?.canCommitRevert && (
          <button class="btn small danger" onClick={() => confirm("Permanently delete the reverted messages?") && commitRevert()}>
            Discard reverted messages
          </button>
        )}
      </div>
    </div>
  )
}

// Permission requests and agent questions block the agent until answered, so they sit right above the input.
export function PendingCards() {
  const sid = currentSessionID.value
  const mine = permissions.value.filter((p) => p.sessionID === sid)
  const myForms = forms.value.filter((f) => f.sessionID === sid)
  const elsewhere = [...new Set([...permissions.value, ...forms.value].map((x) => x.sessionID).filter((id) => id !== sid))]
  if (!mine.length && !myForms.length && !elsewhere.length) return null
  // The note about other sessions goes above the cards: this area sits on the composer, so anything below a card
  // would shift its buttons whenever another session starts or stops waiting.
  return (
    <div class="pending">
      {elsewhere.length > 0 && (
        <button class="note warn small elsewhere" onClick={() => openSession(elsewhere[0])}>
          <Icon name="alert" size={14} />
          {elsewhere.length === 1
            ? `"${sessionMap.value[elsewhere[0]]?.title || "Another session"}" needs your input`
            : `${elsewhere.length} other sessions need your input`}
          <Icon name="chevronRight" size={14} />
        </button>
      )}
      {mine.slice(0, 1).map((p) => (
        <PermissionCard key={p.id} p={p} more={mine.length - 1} />
      ))}
      {!mine.length && myForms.slice(0, 1).map((f) => <FormCard key={f.id} f={f} />)}
    </div>
  )
}

const actionLabels: Record<string, string> = {
  shell: "Run a shell command",
  bash: "Run a shell command",
  edit: "Edit files",
  read: "Read a file",
  webfetch: "Fetch a web page",
  websearch: "Search the web",
  external_directory: "Access a folder outside the project",
  subagent: "Start a subagent",
}

function PermissionCard({ p, more }: { p: Permission; more: number }) {
  const [rejecting, setRejecting] = useState(false)
  const [reason, setReason] = useState("")
  return (
    <div class="card permission" role="alertdialog" aria-label="Permission request">
      <div class="row">
        <Icon name="shield" />
        <strong class="grow">{actionLabels[p.action] ?? `Allow "${p.action}"?`}</strong>
        {more > 0 && <span class="badge">+{more}</span>}
      </div>
      {p.message && <p class="small">{p.message}</p>}
      <ul class="resources mono small">
        {p.resources.map((r, i) => (
          <li key={i}>{r}</li>
        ))}
      </ul>
      {rejecting ? (
        <form
          class="row"
          onSubmit={(e) => {
            e.preventDefault()
            answerPermission(p, "reject", reason.trim() || undefined)
          }}
        >
          <input class="grow" placeholder="Tell the agent what to do instead (optional)" value={reason} onInput={(e) => setReason(e.currentTarget.value)} autoFocus />
          <button class="btn danger" type="submit">
            Reject
          </button>
        </form>
      ) : (
        <div class="row wrap end">
          <button class="btn ghost" onClick={() => setRejecting(true)}>
            Reject
          </button>
          <button class="btn" onClick={() => answerPermission(p, "always")} title={p.save?.length ? `Always allow: ${p.save.join(", ")}` : undefined}>
            Always allow
          </button>
          <button class="btn primary" onClick={() => answerPermission(p, "once")}>
            Allow once
          </button>
        </div>
      )}
    </div>
  )
}

type Answer = Record<string, string | number | boolean | string[]>

function initialAnswer(f: Form): Answer {
  const out: Answer = {}
  for (const field of f.fields) {
    if (field.default !== undefined) out[field.key] = field.default as string
    else if (field.type === "boolean") out[field.key] = false
    else if (field.type === "multiselect") out[field.key] = []
  }
  return out
}

function FormCard({ f }: { f: Form }) {
  const [answer, setAnswer] = useState<Answer>(() => initialAnswer(f))
  const set = (key: string, value: Answer[string]) => setAnswer({ ...answer, [key]: value })
  const missing = f.fields.some(
    (field) => field.required && (answer[field.key] === undefined || answer[field.key] === "" || (Array.isArray(answer[field.key]) && !(answer[field.key] as string[]).length)),
  )
  const empty = f.fields.every((field) => field.type === "external" || answer[field.key] === undefined || answer[field.key] === "")
  return (
    <form
      class="card question"
      role="alertdialog"
      aria-label="Question from the agent"
      onSubmit={(e) => {
        e.preventDefault()
        answerForm(f, answer)
      }}
    >
      <div class="row">
        <Icon name="sparkle" />
        <strong class="grow">{f.fields.length === 1 && f.fields[0].title ? f.fields[0].title : f.title}</strong>
      </div>
      {f.fields.map((field) => (
        <FieldInput key={field.key} field={field} value={answer[field.key]} onChange={(v) => set(field.key, v)} single={f.fields.length === 1} />
      ))}
      <div class="row end">
        <button type="button" class="btn ghost" onClick={() => dismissForm(f)}>
          Dismiss
        </button>
        <button type="submit" class="btn primary" disabled={missing || empty}>
          Send answer
        </button>
      </div>
    </form>
  )
}

function FieldInput({ field, value, onChange, single }: { field: FormField; value: Answer[string] | undefined; onChange: (v: Answer[string]) => void; single: boolean }) {
  const label = !single || !field.title ? field.title : undefined
  const head = (
    <>
      {label && <strong class="small">{label}</strong>}
      {field.description && <p>{field.description}</p>}
    </>
  )
  if (field.type === "external")
    return (
      <div class="stack">
        {head}
        <a class="btn" href={field.url} target="_blank" rel="noopener noreferrer">
          Open link
        </a>
      </div>
    )
  if (field.type === "boolean")
    return (
      <label class="check">
        <input type="checkbox" checked={!!value} onChange={(e) => onChange(e.currentTarget.checked)} />
        <span>{field.description ?? field.title}</span>
      </label>
    )
  if (field.type === "number")
    return (
      <label class="field">
        {head}
        <input type="number" value={value as number | undefined} onInput={(e) => onChange(Number(e.currentTarget.value))} />
      </label>
    )
  if (field.type === "multiselect") {
    const selected = (value as string[] | undefined) ?? []
    return (
      <fieldset class="options">
        {head}
        {field.options?.map((o) => (
          <label key={o.value} class={`option${selected.includes(o.value) ? " selected" : ""}`}>
            <input
              type="checkbox"
              checked={selected.includes(o.value)}
              onChange={(e) => onChange(e.currentTarget.checked ? [...selected, o.value] : selected.filter((v) => v !== o.value))}
            />
            <span>
              <strong>{o.label}</strong>
              {o.description && <small class="muted">{o.description}</small>}
            </span>
          </label>
        ))}
      </fieldset>
    )
  }
  const options = field.options ?? []
  const isCustom = typeof value === "string" && value !== "" && !options.some((o) => o.value === value)
  return (
    <fieldset class="options">
      {head}
      {options.map((o) => (
        <label key={o.value} class={`option${value === o.value ? " selected" : ""}`}>
          <input type="radio" name={field.key} checked={value === o.value} onChange={() => onChange(o.value)} />
          <span>
            <strong>{o.label}</strong>
            {o.description && <small class="muted">{o.description}</small>}
          </span>
        </label>
      ))}
      {(field.custom || !options.length) && (
        <input
          class={isCustom ? "selected" : ""}
          placeholder={field.placeholder ?? (options.length ? "Or type your own answer" : "Your answer")}
          value={isCustom || !options.length ? (value as string) : ""}
          onInput={(e) => onChange(e.currentTarget.value)}
        />
      )}
    </fieldset>
  )
}
