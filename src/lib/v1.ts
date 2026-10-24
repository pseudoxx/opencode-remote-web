// Adapter for OpenCode 1.x servers (the `opencode-ai` npm package, `opencode serve` / `opencode web`).
// 1.x stores messages as {info, parts}, scopes most routes to a project directory via ?directory=, and streams
// every project's events on /global/event as {directory, payload}.
import type {
  AssistantPart,
  Backend,
  BackendEvent,
  DirEntry,
  Form,
  Message,
  Model,
  ModelRef,
  Permission,
  Session,
  ToolStatus,
} from "./types"
import { basename } from "./format"

type V1Session = {
  id: string
  projectID: string
  directory: string
  parentID?: string
  title: string
  cost?: number
  tokens?: { input: number; output: number; reasoning: number; cache: { read: number; write: number } }
  agent?: string
  model?: { id: string; providerID: string; variant?: string }
  time: { created: number; updated: number; archived?: number }
  revert?: { messageID: string; partID?: string; snapshot?: string; diff?: string }
}

type V1Part = {
  id: string
  messageID: string
  sessionID: string
  type: string
  text?: string
  synthetic?: boolean
  ignored?: boolean
  time?: { start?: number; end?: number }
  callID?: string
  tool?: string
  state?: { status: string; input?: Record<string, unknown>; output?: string; error?: string; metadata?: Record<string, unknown>; title?: string }
  mime?: string
  filename?: string
  url?: string
}

type V1Info = {
  id: string
  sessionID: string
  role: "user" | "assistant"
  time: { created: number; completed?: number }
  agent?: string
  model?: { providerID: string; modelID: string; variant?: string }
  modelID?: string
  providerID?: string
  variant?: string
  cost?: number
  tokens?: { input: number; output: number }
  error?: { name?: string; data?: { message?: string } }
  finish?: string
}

type V1Message = { info: V1Info; parts: V1Part[] }

type V1Permission = { id: string; sessionID: string; permission: string; patterns: string[]; always?: string[] }
type V1Question = {
  id: string
  sessionID: string
  questions: Array<{ question: string; header: string; options: Array<{ label: string; description?: string }>; multiple?: boolean; custom?: boolean }>
}

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
  }
}

export function createV1(baseUrl: string, fetcher: typeof fetch, version: string): Backend {
  // Session routes need the session's project directory; remember it from every listing.
  const sessionDirs = new Map<string, string>()
  const roles = new Map<string, "user" | "assistant">()
  const partKinds = new Map<string, string>()

  async function call<T>(method: string, path: string, opts: { query?: Record<string, string | number | boolean | undefined>; body?: unknown; directory?: string; signal?: AbortSignal } = {}): Promise<T> {
    const url = new URL(baseUrl + path)
    const query = { ...opts.query, directory: opts.directory }
    for (const [k, v] of Object.entries(query)) if (v !== undefined && v !== "") url.searchParams.set(k, String(v))
    const res = await fetcher(url.href, {
      method,
      signal: opts.signal,
      headers: { accept: "application/json", ...(opts.body !== undefined ? { "content-type": "application/json" } : {}) },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    })
    if (!res.ok) {
      let message = `HTTP ${res.status}`
      try {
        const err = (await res.json()) as { message?: string; data?: { message?: string }; name?: string }
        message = err.data?.message ?? err.message ?? err.name ?? message
      } catch {}
      if (res.status === 401) throw Object.assign(new HttpError(401, "Not authorized"), { _tag: "UnauthorizedError" })
      throw new HttpError(res.status, message)
    }
    if (res.status === 204) return undefined as T
    const text = await res.text()
    return (text ? JSON.parse(text) : undefined) as T
  }

  const dirOf = (sessionID: string) => sessionDirs.get(sessionID)

  async function defaultModel(directory?: string): Promise<ModelRef | undefined> {
    const config = await call<{ model?: string }>("GET", "/config", { directory }).catch(() => ({}) as { model?: string })
    if (!config.model?.includes("/")) return
    const [providerID, ...rest] = config.model.split("/")
    return { providerID, id: rest.join("/") }
  }

  function remember(s: V1Session) {
    sessionDirs.set(s.id, s.directory)
    return toSession(s)
  }

  return {
    kind: "v1",
    version,
    canCommitRevert: false,
    serverModelState: false,

    async info(signal) {
      const h = await call<{ version: string }>("GET", "/global/health", { signal })
      return { kind: "v1", version: h.version }
    },

    async projects() {
      const list = await call<Array<{ id: string; worktree: string; vcs?: string; name?: string; time: { created: number; updated?: number; initialized?: number } }>>("GET", "/project")
      return list
        .filter((p) => p.worktree && p.worktree !== "/")
        .map((p) => ({ id: p.id, directory: p.worktree, name: p.name || basename(p.worktree), vcs: p.vcs, active: p.time.updated ?? p.time.initialized ?? p.time.created }))
        .sort((a, b) => b.active - a.active)
    },

    async sessions({ directory, search, limit }) {
      const list = await call<V1Session[]>("GET", "/session", { directory, query: { roots: true, search, limit: limit ?? 100 } })
      return list
        .filter((s) => !s.time.archived)
        .map(remember)
        .sort((a, b) => b.updated - a.updated)
    },

    async session(id) {
      return remember(await call<V1Session>("GET", `/session/${id}`, { directory: dirOf(id) }))
    },

    async createSession({ directory }) {
      return remember(await call<V1Session>("POST", "/session", { directory, body: {} }))
    },

    async renameSession(id, title) {
      remember(await call<V1Session>("PATCH", `/session/${id}`, { directory: dirOf(id), body: { title } }))
    },

    async deleteSession(id) {
      await call("DELETE", `/session/${id}`, { directory: dirOf(id) })
    },

    async forkSession(id, beforeMessageID) {
      return remember(await call<V1Session>("POST", `/session/${id}/fork`, { directory: dirOf(id), body: beforeMessageID ? { messageID: beforeMessageID } : {} }))
    },

    async compactSession(id) {
      const s = remember(await call<V1Session>("GET", `/session/${id}`, { directory: dirOf(id) }))
      const model = s.model ?? (await defaultModel(s.directory))
      if (!model) throw new Error("No model available to compact with")
      await call("POST", `/session/${id}/summarize`, { directory: dirOf(id), body: { providerID: model.providerID, modelID: model.id } })
    },

    async messages(sessionID, opts) {
      const limit = opts?.limit ?? 80
      const list = await call<V1Message[]>("GET", `/session/${sessionID}/message`, {
        directory: dirOf(sessionID),
        query: { limit, before: opts?.cursor },
      })
      for (const m of list) roles.set(m.info.id, m.info.role)
      const messages = list.map(toMessage).filter((m): m is Message => !!m)
      messages.sort((a, b) => a.created - b.created || (a.id < b.id ? -1 : 1))
      return { messages, older: list.length >= limit ? list[0]?.info.id : undefined }
    },

    async prompt(sessionID, { text, files, model, agent }) {
      const parts: unknown[] = []
      if (text) parts.push({ type: "text", text })
      for (const f of files) parts.push({ type: "file", mime: f.mime || "application/octet-stream", filename: f.name, url: `data:${f.mime || "application/octet-stream"};base64,${f.data}` })
      await call("POST", `/session/${sessionID}/prompt_async`, {
        directory: dirOf(sessionID),
        body: {
          parts,
          ...(model ? { model: { providerID: model.providerID, modelID: model.id } } : {}),
          ...(model?.variant && model.variant !== "default" ? { variant: model.variant } : {}),
          ...(agent ? { agent } : {}),
        },
      })
    },

    async command(sessionID, command, args) {
      // The 1.x command endpoint answers only when the run finishes; events carry the progress meanwhile.
      call("POST", `/session/${sessionID}/command`, { directory: dirOf(sessionID), body: { command, arguments: args } }).catch(() => {})
    },

    async shell(sessionID, command) {
      call("POST", `/session/${sessionID}/shell`, { directory: dirOf(sessionID), body: { agent: "build", command } }).catch(() => {})
    },

    async interrupt(sessionID) {
      await call("POST", `/session/${sessionID}/abort`, { directory: dirOf(sessionID) })
    },

    async busySessions() {
      const dirs = new Set(sessionDirs.values())
      const busy: string[] = []
      await Promise.all(
        [...(dirs.size ? dirs : new Set([undefined]))].map(async (d) => {
          const status = await call<Record<string, { type: string }>>("GET", "/session/status", { directory: d }).catch(() => ({}) as Record<string, { type: string }>)
          for (const [id, s] of Object.entries(status)) if (s.type !== "idle") busy.push(id)
        }),
      )
      return busy
    },

    async models(directory) {
      const [res, configured] = await Promise.all([
        call<{ providers: Array<{ id: string; name: string; models: Record<string, { id: string; name: string; status?: string; variants?: Record<string, unknown>; capabilities?: { input?: { image?: boolean } } }> }>; default: Record<string, string> }>("GET", "/config/providers", { directory }),
        defaultModel(directory),
      ])
      const models: Model[] = []
      for (const p of res.providers) {
        for (const m of Object.values(p.models)) {
          if (m.status === "deprecated") continue
          models.push({ providerID: p.id, id: m.id, name: m.name, providerName: p.name, variants: Object.keys(m.variants ?? {}), images: !!m.capabilities?.input?.image })
        }
      }
      const first = Object.entries(res.default)[0]
      return { models, default: configured ?? (first ? { providerID: first[0], id: first[1] } : undefined) }
    },

    async agents(directory) {
      const list = await call<Array<{ name: string; description?: string; mode: string; hidden?: boolean }>>("GET", "/agent", { directory })
      return list.filter((a) => a.mode !== "subagent" && !a.hidden).map((a) => ({ id: a.name, name: a.name[0].toUpperCase() + a.name.slice(1), description: a.description }))
    },

    async commands(directory) {
      const list = await call<Array<{ name: string; description?: string }>>("GET", "/command", { directory })
      return list.map((c) => ({ name: c.name, description: c.description }))
    },

    // 1.x picks the model and agent per prompt; the store remembers the choice and sends it with the next prompt.
    async switchModel() {},
    async switchAgent() {},

    async revert(sessionID, messageID) {
      remember(await call<V1Session>("POST", `/session/${sessionID}/revert`, { directory: dirOf(sessionID), body: { messageID } }))
    },

    async unrevert(sessionID) {
      await call("POST", `/session/${sessionID}/unrevert`, { directory: dirOf(sessionID) })
    },

    // 1.x drops reverted messages automatically with the next prompt; there is no separate commit.
    async commitRevert() {},

    async permissions(directory) {
      const list = await call<V1Permission[]>("GET", "/permission", { directory })
      return list.map(toPermission)
    },

    async replyPermission(p, decision, message) {
      await call("POST", `/permission/${p.id}/reply`, { directory: dirOf(p.sessionID), body: { reply: decision, ...(message ? { message } : {}) } })
    },

    async forms(directory) {
      const list = await call<V1Question[]>("GET", "/question", { directory })
      return list.map(toForm)
    },

    async replyForm(f, answer) {
      const answers = f.fields.map((field) => {
        const v = answer[field.key]
        if (Array.isArray(v)) return v
        return v === undefined || v === "" ? [] : [String(v)]
      })
      await call("POST", `/question/${f.id}/reply`, { directory: dirOf(f.sessionID), body: { answers } })
    },

    async cancelForm(f) {
      await call("POST", `/question/${f.id}/reject`, { directory: dirOf(f.sessionID) })
    },

    async exportSession(sessionID) {
      const info = await call<V1Session>("GET", `/session/${sessionID}`, { directory: dirOf(sessionID) })
      const messages = await call<V1Message[]>("GET", `/session/${sessionID}/message`, { directory: dirOf(sessionID) })
      return { info, messages }
    },

    async diff(sessionID, range) {
      const list = await call<Array<{ file?: string; patch?: string; additions: number; deletions: number; status?: string }>>("GET", `/session/${sessionID}/diff`, {
        directory: dirOf(sessionID),
        query: { messageID: range?.from && !range.to ? range.from : undefined },
      })
      return list.map((f) => ({ file: f.file ?? "(unknown)", additions: f.additions, deletions: f.deletions, status: f.status ?? "modified", patch: f.patch }))
    },

    async listDirectory(directory) {
      const list = await call<Array<{ name: string; absolute: string; type: "file" | "directory" }>>("GET", "/file", { directory, query: { path: "." } })
      return list.map((e): DirEntry => ({ name: e.name, path: e.absolute, type: e.type })).sort((a, b) => a.name.localeCompare(b.name))
    },

    async home() {
      const p = await call<{ home: string; directory: string }>("GET", "/path").catch(() => undefined)
      return p?.directory ?? p?.home
    },

    async subscribe(handler, { signal, onActivity }) {
      const res = await fetcher(`${baseUrl}/global/event`, { signal, headers: { accept: "text/event-stream" } })
      if (res.status === 401) throw Object.assign(new HttpError(401, "Not authorized"), { _tag: "UnauthorizedError" })
      if (!res.ok || !res.body) throw new HttpError(res.status, `Event stream failed (HTTP ${res.status})`)
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ""
      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) return
          onActivity()
          buffer += decoder.decode(value, { stream: true }).replace(/\r\n?/g, "\n")
          let boundary = buffer.indexOf("\n\n")
          while (boundary !== -1) {
            const block = buffer.slice(0, boundary)
            buffer = buffer.slice(boundary + 2)
            const data = block
              .split("\n")
              .filter((l) => l.startsWith("data:"))
              .map((l) => l.slice(5).trimStart())
              .join("\n")
            if (data) {
              try {
                const event = JSON.parse(data) as { directory?: string; payload?: { type: string; properties: Record<string, unknown> } }
                if (event.payload) for (const mapped of mapEvent(event.payload, event.directory)) handler(mapped)
              } catch {}
            }
            boundary = buffer.indexOf("\n\n")
          }
        }
      } finally {
        reader.cancel().catch(() => {})
      }
    },
  }

  function toMessage(m: V1Message): Message | undefined {
    const { info, parts } = m
    if (info.role === "user") {
      const visible = parts.filter((p) => p.type === "text" && !p.synthetic && !p.ignored)
      return {
        kind: "user",
        id: info.id,
        created: info.time.created,
        text: visible.map((p) => p.text ?? "").join("\n"),
        attachments: parts.filter((p) => p.type === "file").map((p) => ({ name: p.filename ?? p.mime ?? "file", mime: p.mime ?? "" })),
      }
    }
    return {
      kind: "assistant",
      id: info.id,
      created: info.time.created,
      completed: info.time.completed,
      agent: info.agent,
      model: info.providerID && info.modelID ? { providerID: info.providerID, id: info.modelID, variant: info.variant } : undefined,
      parts: parts.map(toPart).filter((p): p is AssistantPart => !!p),
      cost: info.cost,
      tokens: info.tokens ? { input: info.tokens.input, output: info.tokens.output } : undefined,
      error: info.error && info.error.name !== "MessageAbortedError" ? (info.error.data?.message ?? info.error.name) : undefined,
      finish: info.finish,
      files: patchedFiles(parts),
    }
  }

  function mapEvent(payload: { type: string; properties: Record<string, unknown> }, directory?: string): BackendEvent[] {
    const p = payload.properties as Record<string, any>
    switch (payload.type) {
      case "server.connected":
        return [{ type: "connected" }]
      case "session.created":
      case "session.updated": {
        const s = remember(p.info as V1Session)
        const events: BackendEvent[] = [{ type: "session.upsert", session: s }]
        if (payload.type === "session.created") events.push({ type: "projects.invalidate", directory: s.directory || directory })
        return events
      }
      case "session.deleted":
        return [{ type: "session.deleted", sessionID: (p.info as V1Session).id }]
      case "session.status": {
        const status = p.status as { type: string; message?: string }
        return [{ type: "session.busy", sessionID: p.sessionID, busy: status.type !== "idle", retry: status.type === "retry" ? status.message : undefined }]
      }
      case "session.idle":
        return [
          { type: "session.busy", sessionID: p.sessionID, busy: false },
          { type: "session.invalidate", sessionID: p.sessionID, messages: true },
        ]
      case "session.error":
      case "message.removed":
      case "session.compacted":
        return p.sessionID ? [{ type: "session.invalidate", sessionID: p.sessionID, messages: true }] : []
      case "message.updated": {
        const info = p.info as V1Info
        roles.set(info.id, info.role)
        if (info.role === "user") return []
        const events: BackendEvent[] = [
          {
            type: "message.assistant",
            sessionID: info.sessionID,
            messageID: info.id,
            agent: info.agent,
            model: info.providerID && info.modelID ? { providerID: info.providerID, id: info.modelID } : undefined,
          },
        ]
        if (info.time.completed) events.push({ type: "session.invalidate", sessionID: info.sessionID, messages: true })
        return events
      }
      case "message.part.updated": {
        const part = p.part as V1Part
        partKinds.set(part.id, part.type)
        if (roles.get(part.messageID) === "user") {
          if (part.type === "text" && !part.synthetic) return [{ type: "message.user", sessionID: part.sessionID, messageID: part.messageID, text: part.text ?? "" }]
          return []
        }
        if (part.type === "text" || part.type === "reasoning")
          return [{ type: "part.text", sessionID: part.sessionID, messageID: part.messageID, key: `${part.type}:${part.id}`, kind: part.type, text: part.text ?? "", done: !!part.time?.end }]
        if (part.type === "tool" && part.callID) {
          const tool = toPart(part)
          if (tool?.type === "tool")
            return [{ type: "part.tool", sessionID: part.sessionID, messageID: part.messageID, tool: { ...tool, id: part.callID } }]
        }
        if (part.type === "step-finish" || part.type === "patch") return [{ type: "session.invalidate", sessionID: part.sessionID, messages: true }]
        return []
      }
      case "message.part.delta": {
        if (p.field !== "text" || roles.get(p.messageID) === "user") return []
        const kind = partKinds.get(p.partID) === "reasoning" ? "reasoning" : "text"
        return [{ type: "part.text", sessionID: p.sessionID, messageID: p.messageID, key: `${kind}:${p.partID}`, kind, delta: p.delta }]
      }
      case "permission.asked":
        return [{ type: "permission.asked", permission: toPermission(p as V1Permission) }]
      case "permission.replied":
        return [{ type: "permission.replied", sessionID: p.sessionID, id: p.requestID }]
      case "question.asked":
        return [{ type: "form.created", form: toForm(p as V1Question) }]
      case "question.replied":
      case "question.rejected":
        return [{ type: "form.done", sessionID: p.sessionID, id: p.requestID }]
      case "project.updated":
        return [{ type: "projects.invalidate" }]
      default:
        return []
    }
  }
}

function patchedFiles(parts: V1Part[]) {
  const files = new Set<string>()
  for (const p of parts as Array<V1Part & { files?: string[] }>) if (p.type === "patch") for (const f of p.files ?? []) files.add(f)
  return files.size ? [...files] : undefined
}

const toolStatus: Record<string, ToolStatus> = { pending: "pending", running: "running", completed: "completed", error: "error" }

function toPart(p: V1Part): AssistantPart | undefined {
  if (p.type === "text") return p.synthetic || p.ignored ? undefined : { type: "text", key: `text:${p.id}`, text: p.text ?? "" }
  if (p.type === "reasoning") return { type: "reasoning", key: `reasoning:${p.id}`, text: p.text ?? "" }
  if (p.type === "tool" && p.callID && p.tool)
    return {
      type: "tool",
      key: `tool:${p.callID}`,
      id: p.callID,
      name: p.tool === "bash" ? "shell" : p.tool,
      status: toolStatus[p.state?.status ?? "pending"] ?? "running",
      input: p.state?.input,
      output: p.state?.output,
      error: p.state?.error,
      metadata: p.state?.metadata,
    }
}

function toSession(s: V1Session): Session {
  const files = s.revert?.diff
    ? [...s.revert.diff.matchAll(/^diff --git a\/(.+?) b\//gm)].map((m) => ({ file: m[1], additions: 0, deletions: 0, status: "modified" }))
    : []
  const session: Session = {
    id: s.id,
    title: s.title,
    projectID: s.projectID,
    directory: s.directory,
    parentID: s.parentID,
    created: s.time.created,
    updated: s.time.updated,
    cost: s.cost ?? 0,
    tokens: {
      input: s.tokens?.input ?? 0,
      output: s.tokens?.output ?? 0,
      reasoning: s.tokens?.reasoning ?? 0,
      cacheRead: s.tokens?.cache?.read ?? 0,
    },
    revert: s.revert ? { messageID: s.revert.messageID, files } : undefined,
  }
  // Only carry model/agent when the server knows them, so a choice made in this app is not wiped by a refresh.
  if (s.model) session.model = { providerID: s.model.providerID, id: s.model.id, variant: s.model.variant }
  if (s.agent) session.agent = s.agent
  return session
}

function toPermission(p: V1Permission): Permission {
  return { id: p.id, sessionID: p.sessionID, action: p.permission === "bash" ? "shell" : p.permission, resources: p.patterns ?? [], save: p.always }
}

function toForm(q: V1Question): Form {
  return {
    id: q.id,
    sessionID: q.sessionID,
    title: "Questions",
    fields: q.questions.map((item, i) => ({
      key: `q${i}`,
      type: item.multiple ? "multiselect" : "string",
      title: item.header,
      description: item.question,
      options: item.options.map((o) => ({ value: o.label, label: o.label, description: o.description })),
      custom: item.custom ?? true,
    })),
  }
}
