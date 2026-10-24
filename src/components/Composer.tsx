import { useEffect, useMemo, useRef, useState } from "preact/hooks"
import { Icon } from "./Icon"
import { Spinner } from "./ui"
import {
  agents,
  backend,
  busy,
  chooseAgent,
  chooseModel,
  commands,
  currentSessionID,
  directory,
  interrupt,
  models,
  prefs,
  promptText,
  selectedAgent,
  selectedModel,
  sendPrompt,
  toast,
} from "../state/store"
import type { Model, PromptFile } from "../lib/types"

const MAX_FILE_BYTES = 15 * 1024 * 1024

function readAsBase64(file: File): Promise<PromptFile> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error)
    reader.onload = () => {
      const result = String(reader.result)
      resolve({ name: file.name || "pasted-image.png", mime: file.type || "application/octet-stream", data: result.slice(result.indexOf(",") + 1) })
    }
    reader.readAsDataURL(file)
  })
}

const coarsePointer = typeof matchMedia !== "undefined" && matchMedia("(pointer: coarse)").matches

function modelKey(m: { providerID: string; id: string }) {
  return `${m.providerID}/${m.id}`
}

export function Composer() {
  const [files, setFiles] = useState<PromptFile[]>([])
  const [sending, setSending] = useState(false)
  const [dragging, setDragging] = useState(false)
  const area = useRef<HTMLTextAreaElement>(null)
  const picker = useRef<HTMLInputElement>(null)
  const sid = currentSessionID.value
  const isBusy = sid ? !!busy.value[sid] : false
  const text = promptText.value
  const model = selectedModel.value
  const current = models.value.find((m) => m.providerID === model?.providerID && m.id === model?.id)
  const enterSends = prefs.value.enterToSend ?? !coarsePointer
  const placeholder = directory.value ? (isBusy ? "Steer or queue a message…" : "Message OpenCode…") : "Choose a project first"

  // Grow with the content, up to a cap set in CSS. Browsers count a wrapped placeholder in scrollHeight, so the
  // placeholder is a dependency too.
  useEffect(() => {
    const el = area.current
    if (!el) return
    el.style.height = "auto"
    el.style.height = `${el.scrollHeight}px`
  }, [text, placeholder])

  const grouped = useMemo(() => {
    const groups = new Map<string, Model[]>()
    for (const m of models.value) {
      const list = groups.get(m.providerName) ?? []
      list.push(m)
      groups.set(m.providerName, list)
    }
    return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b))
  }, [models.value])

  const slash = /^\/(\S*)$/.exec(text)
  const suggestions = slash ? commands.value.filter((c) => c.name.startsWith(slash[1])).slice(0, 8) : []

  async function addFiles(list: FileList | File[] | null | undefined) {
    if (!list) return
    const next: PromptFile[] = []
    for (const file of Array.from(list)) {
      if (file.size > MAX_FILE_BYTES) {
        toast(`${file.name} is larger than 15 MB`, "error")
        continue
      }
      try {
        next.push(await readAsBase64(file))
      } catch {
        toast(`Could not read ${file.name}`, "error")
      }
    }
    if (next.length) setFiles((prev) => [...prev, ...next])
  }

  async function submit() {
    if (sending || (!text.trim() && !files.length)) return
    setSending(true)
    const ok = await sendPrompt(text, files)
    setSending(false)
    if (ok) {
      promptText.value = ""
      setFiles([])
      if (!coarsePointer) area.current?.focus()
    }
  }

  return (
    <div
      class={`composer${dragging ? " dragging" : ""}`}
      onDragOver={(e) => {
        if (e.dataTransfer?.types.includes("Files")) {
          e.preventDefault()
          setDragging(true)
        }
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault()
        setDragging(false)
        addFiles(e.dataTransfer?.files)
      }}
    >
      {suggestions.length > 0 && (
        <ul class="suggestions" role="listbox">
          {suggestions.map((c) => (
            <li key={c.name}>
              <button
                role="option"
                onClick={() => {
                  promptText.value = `/${c.name} `
                  area.current?.focus()
                }}
              >
                <code>/{c.name}</code>
                {c.description && <span class="muted ellipsis">{c.description}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
      {files.length > 0 && (
        <div class="attachments">
          {files.map((f, i) => (
            <span key={i} class="chip">
              {f.mime.startsWith("image/") ? (
                <img src={`data:${f.mime};base64,${f.data}`} alt="" width={20} height={20} />
              ) : (
                <Icon name="file" size={14} />
              )}
              <span class="ellipsis">{f.name}</span>
              <button class="icon-btn tiny" aria-label={`Remove ${f.name}`} onClick={() => setFiles(files.filter((_, j) => j !== i))}>
                <Icon name="x" size={12} />
              </button>
            </span>
          ))}
        </div>
      )}
      <div class="input-row">
        <button class="icon-btn" aria-label="Attach files" title="Attach files" onClick={() => picker.current?.click()}>
          <Icon name="paperclip" />
        </button>
        <input
          ref={picker}
          type="file"
          multiple
          hidden
          onChange={(e) => {
            addFiles(e.currentTarget.files)
            e.currentTarget.value = ""
          }}
        />
        <textarea
          ref={area}
          rows={1}
          value={text}
          placeholder={placeholder}
          enterkeyhint={enterSends ? "send" : "enter"}
          onInput={(e) => (promptText.value = e.currentTarget.value)}
          onPaste={(e) => {
            const pasted = e.clipboardData?.files
            if (pasted?.length) {
              e.preventDefault()
              addFiles(pasted)
            }
          }}
          onKeyDown={(e) => {
            if (e.key !== "Enter" || e.isComposing || e.keyCode === 229) return
            if (e.metaKey || e.ctrlKey || (enterSends && !e.shiftKey)) {
              e.preventDefault()
              submit()
            }
          }}
          aria-label="Message"
        />
        {isBusy && (
          <button class="icon-btn stop" aria-label="Stop" title="Stop the agent" onClick={() => interrupt()}>
            <Icon name="stop" />
          </button>
        )}
        <button
          class="icon-btn send"
          aria-label="Send"
          title={enterSends ? "Send (Enter)" : "Send (Ctrl/⌘+Enter)"}
          disabled={sending || (!text.trim() && !files.length) || !backend.value || !directory.value}
          onClick={submit}
        >
          {sending ? <Spinner size={16} /> : <Icon name="send" />}
        </button>
      </div>
      <div class="pickers">
        {agents.value.length > 0 && (
          <label class="picker" title="Agent">
            <select value={selectedAgent.value} onChange={(e) => chooseAgent(e.currentTarget.value)} aria-label="Agent">
              {agents.value.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
              {!agents.value.some((a) => a.id === selectedAgent.value) && <option value={selectedAgent.value}>{selectedAgent.value}</option>}
            </select>
            <Icon name="chevronDown" size={12} />
          </label>
        )}
        <label class="picker grow" title="Model">
          <select
            value={model ? modelKey(model) : ""}
            onChange={(e) => {
              const m = models.value.find((x) => modelKey(x) === e.currentTarget.value)
              if (m) chooseModel({ providerID: m.providerID, id: m.id })
            }}
            aria-label="Model"
          >
            {!current && <option value={model ? modelKey(model) : ""}>{model ? modelKey(model) : "Default model"}</option>}
            {grouped.map(([provider, list]) => (
              <optgroup key={provider} label={provider}>
                {list.map((m) => (
                  <option key={modelKey(m)} value={modelKey(m)}>
                    {m.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          <Icon name="chevronDown" size={12} />
        </label>
        {current && current.variants.length > 0 && (
          <label class="picker" title="Reasoning effort">
            <select
              value={model?.variant ?? "default"}
              onChange={(e) => {
                // Read the live selection: a model change made a moment ago may not have re-rendered yet.
                const latest = selectedModel.peek()
                if (latest) chooseModel({ providerID: latest.providerID, id: latest.id, variant: e.currentTarget.value })
              }}
              aria-label="Reasoning effort"
            >
              <option value="default">Default effort</option>
              {current.variants.filter((v) => v !== "default").map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
            <Icon name="chevronDown" size={12} />
          </label>
        )}
      </div>
    </div>
  )
}
