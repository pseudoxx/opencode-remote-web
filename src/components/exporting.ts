import { backend, fail, sessionMap, toast } from "../state/store"
import { canShareFiles, copyText, downloadFile, exportFilename, sessionToMarkdown, shareFile } from "../lib/export"
import type { Message } from "../lib/types"

// Exports always fetch the whole conversation, not just the page currently on screen.
async function allMessages(sessionID: string) {
  const b = backend.value
  if (!b) throw new Error("Not connected")
  const out: Message[] = []
  let cursor: string | undefined
  for (let page = 0; page < 100; page++) {
    const res = await b.messages(sessionID, { limit: 200, cursor })
    out.unshift(...res.messages)
    if (!res.older) break
    cursor = res.older
  }
  const seen = new Set<string>()
  return out.filter((m) => (seen.has(m.id) ? false : (seen.add(m.id), true))).sort((a, b) => a.created - b.created)
}

export async function sessionMarkdown(sessionID: string) {
  return sessionToMarkdown(sessionMap.value[sessionID], await allMessages(sessionID))
}

export async function exportSession(sessionID: string, format: "md" | "json", via: "download" | "share" = "download") {
  const b = backend.value
  if (!b) return
  try {
    const session = sessionMap.value[sessionID]
    const content =
      format === "md" ? await sessionMarkdown(sessionID) : JSON.stringify(await b.exportSession(sessionID), null, 2)
    const filename = exportFilename(session, format)
    const mime = format === "md" ? "text/markdown" : "application/json"
    if (via === "share" && canShareFiles()) {
      try {
        await shareFile(filename, content, mime)
        return
      } catch (error) {
        if ((error as DOMException).name === "AbortError") return
      }
    }
    downloadFile(filename, content, mime)
    toast(`Saved ${filename}`, "success")
  } catch (error) {
    fail(error, "Export")
  }
}

export async function copySession(sessionID: string) {
  try {
    const ok = await copyText(await sessionMarkdown(sessionID))
    toast(ok ? "Conversation copied as Markdown" : "Copy failed", ok ? "success" : "error")
  } catch (error) {
    fail(error, "Copy")
  }
}
