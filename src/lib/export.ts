import type { AssistantMessage, Message, Session, ToolPart } from "./types"
import { slug } from "./format"

export function toolSummary(tool: Pick<ToolPart, "name" | "input" | "inputText">): string {
  const input = tool.input ?? {}
  const pick = (...keys: string[]) => {
    for (const k of keys) {
      const v = input[k]
      if (typeof v === "string" && v) return v
    }
  }
  const value =
    pick("command", "cmd") ??
    pick("path", "filePath", "file") ??
    pick("pattern", "query", "url") ??
    pick("description", "prompt", "agent", "id")
  if (value) return value.length > 160 ? value.slice(0, 157) + "…" : value
  if (tool.name === "question") {
    const qs = input.questions as Array<{ question?: string }> | undefined
    if (qs?.[0]?.question) return qs[0].question
  }
  return ""
}

function fence(text: string, lang = "") {
  const longest = Math.max(2, ...[...text.matchAll(/`+/g)].map((m) => m[0].length))
  const ticks = "`".repeat(longest + 1)
  return `${ticks}${lang}\n${text.replace(/\n$/, "")}\n${ticks}`
}

export function assistantToMarkdown(m: AssistantMessage, opts: { tools?: boolean; reasoning?: boolean } = {}) {
  const out: string[] = []
  for (const part of m.parts) {
    if (part.type === "text" && part.text.trim()) out.push(part.text.trim())
    if (part.type === "reasoning" && opts.reasoning && part.text.trim())
      out.push(part.text.trim().split("\n").map((l) => `> ${l}`).join("\n"))
    if (part.type === "tool" && opts.tools) {
      const summary = toolSummary(part)
      const body = [
        `**Tool \`${part.name}\`**${summary ? ` — ${summary.replace(/\n/g, " ")}` : ""} (${part.status})`,
        part.output ? fence(part.output.length > 4000 ? part.output.slice(0, 4000) + "\n…" : part.output) : "",
        part.error ? `Error: ${part.error}` : "",
      ].filter(Boolean)
      out.push(body.join("\n\n"))
    }
  }
  if (m.error) out.push(`**Error:** ${m.error}`)
  return out.join("\n\n")
}

export function messageToMarkdown(m: Message) {
  if (m.kind === "user") return m.text
  if (m.kind === "assistant") return assistantToMarkdown(m)
  return m.text
}

export function sessionToMarkdown(session: Session | undefined, messages: Message[], opts = { tools: true, reasoning: false }) {
  const title = session?.title || "OpenCode session"
  const lines = [`# ${title}`, ""]
  const meta = [session?.directory, session ? new Date(session.created).toLocaleString() : undefined].filter(Boolean)
  if (meta.length) lines.push(`_${meta.join(" · ")}_`, "")
  for (const m of messages) {
    if (m.kind === "user") {
      lines.push("## User", "", m.text || "_(empty)_")
      if (m.attachments.length) lines.push("", `_Attachments: ${m.attachments.map((a) => a.name).join(", ")}_`)
      lines.push("")
    } else if (m.kind === "assistant") {
      const body = assistantToMarkdown(m, opts)
      if (!body) continue
      const model = m.model ? ` (${m.model.providerID}/${m.model.id})` : ""
      lines.push(`## Assistant${model}`, "", body, "")
    } else {
      lines.push(`_${m.text}_`, "")
    }
  }
  return lines.join("\n").trim() + "\n"
}

export function exportFilename(session: Session | undefined, ext: string) {
  const date = new Date().toISOString().slice(0, 10)
  return `${slug(session?.title || "opencode-session")}-${date}.${ext}`
}

export async function copyText(text: string) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {}
  // Fallback for plain-http pages, where the async clipboard API is unavailable.
  const area = document.createElement("textarea")
  area.value = text
  area.setAttribute("readonly", "")
  area.style.position = "fixed"
  area.style.opacity = "0"
  document.body.appendChild(area)
  area.select()
  area.setSelectionRange(0, text.length)
  let ok = false
  try {
    ok = document.execCommand("copy")
  } catch {}
  area.remove()
  return ok
}

export function downloadFile(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  a.rel = "noopener"
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

export function canShareFiles() {
  try {
    const probe = new File(["x"], "x.md", { type: "text/markdown" })
    return typeof navigator.canShare === "function" && navigator.canShare({ files: [probe] })
  } catch {
    return false
  }
}

// The share sheet is the most natural way to save or send a file on iOS and Android.
export async function shareFile(filename: string, content: string, mime: string) {
  const file = new File([content], filename, { type: mime })
  await navigator.share({ files: [file], title: filename })
}
