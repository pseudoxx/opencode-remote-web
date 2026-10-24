import { batch, computed, effect, signal } from "@preact/signals"
import type {
  Agent,
  AssistantMessage,
  AssistantPart,
  Backend,
  BackendEvent,
  Command,
  Form,
  Message,
  MessagePage,
  Model,
  ModelRef,
  Permission,
  Project,
  PromptFile,
  ReasoningPart,
  Session,
  TextPart,
  ToolPart,
} from "../lib/types"
import { authHeader, createBackend, describeError, detect, isUnauthorized, type ConnectError } from "../lib/connect"
import { loadPrefs, loadServers, savePrefs, saveServers, type Prefs, type ServerRecord } from "../lib/storage"
import { basename } from "../lib/format"

// ---------------------------------------------------------------------------------------------------------------
// Saved servers and preferences (this device only)

export const servers = signal<ServerRecord[]>(loadServers())
export const prefs = signal<Prefs>(loadPrefs())

effect(() => saveServers(servers.value))
effect(() => savePrefs(prefs.value))

export function setPref<K extends keyof Prefs>(key: K, value: Prefs[K]) {
  prefs.value = { ...prefs.value, [key]: value }
}

export function upsertServer(record: ServerRecord) {
  const existing = servers.value.findIndex((s) => s.id === record.id || (s.url === record.url && s.username === record.username))
  if (existing === -1) servers.value = [...servers.value, record]
  else servers.value = servers.value.map((s, i) => (i === existing ? { ...record, id: s.id } : s))
  return servers.value.find((s) => s.url === record.url && s.username === record.username) ?? record
}

export function updateServer(id: string, patch: Partial<ServerRecord>) {
  servers.value = servers.value.map((s) => (s.id === id ? { ...s, ...patch } : s))
  if (activeServer.value?.id === id) activeServer.value = { ...activeServer.value, ...patch }
}

export function removeServer(id: string) {
  if (activeServer.value?.id === id) disconnect()
  servers.value = servers.value.filter((s) => s.id !== id)
  if (prefs.value.lastServer === id) setPref("lastServer", undefined)
}

// ---------------------------------------------------------------------------------------------------------------
// Toasts

export type Toast = { id: number; text: string; tone: "info" | "error" | "success" }
export const toasts = signal<Toast[]>([])
let toastSeq = 0

export function toast(text: string, tone: Toast["tone"] = "info", ms = 3500) {
  const id = ++toastSeq
  toasts.value = [...toasts.value.slice(-3), { id, text, tone }]
  setTimeout(() => (toasts.value = toasts.value.filter((t) => t.id !== id)), ms)
}

export function fail(error: unknown, prefix?: string) {
  const text = describeError(error)
  toast(prefix ? `${prefix}: ${text}` : text, "error", 6000)
}

// ---------------------------------------------------------------------------------------------------------------
// Connection

export type ConnStatus = "idle" | "connecting" | "live" | "reconnecting" | "offline" | "unauthorized" | "error"
export type ConnState = {
  status: ConnStatus
  error?: string
  reason?: ConnectError["reason"]
  latency?: number
  attempt?: number
  since?: number
}

export const conn = signal<ConnState>({ status: "idle" })
export const activeServer = signal<ServerRecord | null>(null)
export const backend = signal<Backend | null>(null)
export const lastActivity = signal(0)

const HEARTBEAT_STALE_MS = 45_000 // the server sends a keepalive every ~15s
const RESUME_CHECK_MS = 20_000

let lifecycle: AbortController | null = null
let stream: AbortController | null = null
let wakeSleep: (() => void) | null = null
let watchdog: ReturnType<typeof setInterval> | null = null

function setConn(patch: Partial<ConnState>) {
  const next = { ...conn.value, ...patch }
  if (patch.status && patch.status !== conn.value.status) next.since = Date.now()
  conn.value = next
}

export async function connectServer(record: ServerRecord) {
  disconnect()
  failedServer.value = null
  const ctrl = new AbortController()
  lifecycle = ctrl
  activeServer.value = record
  setConn({ status: "connecting", error: undefined, reason: undefined, attempt: 0, latency: undefined })
  try {
    const started = performance.now()
    const { kind, version } = await detect(record.url, authHeader(record), ctrl.signal)
    if (ctrl.signal.aborted) return
    const b = createBackend(record, kind, version)
    batch(() => {
      updateServer(record.id, { kind, version, lastUsed: Date.now() })
      setPref("lastServer", record.id)
      backend.value = b
      directory.value = record.lastDirectory ?? null
      currentSessionID.value = record.lastSession ?? null
      setConn({ latency: Math.round(performance.now() - started) })
    })
    runStream(b, ctrl)
    watchdog = setInterval(() => tick(b), 5000)
  } catch (error) {
    if (ctrl.signal.aborted) return
    const e = error as ConnectError
    // Nothing to show yet, so go back to the server list with the reason.
    lifecycle = null
    batch(() => {
      activeServer.value = null
      setConn({
        status: isUnauthorized(error) ? "unauthorized" : "error",
        error: describeError(error),
        reason: e.reason,
      })
      failedServer.value = record.id
    })
  }
}

export const failedServer = signal<string | null>(null)

export function disconnect() {
  lifecycle?.abort()
  lifecycle = null
  stream?.abort()
  stream = null
  if (watchdog) clearInterval(watchdog)
  watchdog = null
  batch(() => {
    backend.value = null
    activeServer.value = null
    conn.value = { status: "idle" }
    resetWorkspace()
  })
}

export function retryConnection() {
  const record = activeServer.value
  if (record) connectServer(record)
}

async function runStream(b: Backend, ctrl: AbortController) {
  let attempt = 0
  while (!ctrl.signal.aborted) {
    const current = new AbortController()
    stream = current
    const stop = () => current.abort()
    ctrl.signal.addEventListener("abort", stop, { once: true })
    lastActivity.value = Date.now()
    let failure: unknown
    try {
      await b.subscribe(
        (event) => {
          if (event.type === "connected") {
            attempt = 0
            onConnected(b)
          } else apply(event)
        },
        { signal: current.signal, onActivity: () => (lastActivity.value = Date.now()) },
      )
    } catch (error) {
      failure = error
    } finally {
      ctrl.signal.removeEventListener("abort", stop)
    }
    if (ctrl.signal.aborted) return
    if (failure && isUnauthorized(failure)) {
      setConn({ status: "unauthorized", error: "The server no longer accepts this device's credentials. Pair again." })
      return
    }
    attempt++
    setConn({
      status: navigator.onLine === false ? "offline" : "reconnecting",
      attempt,
      error: failure && !current.signal.aborted ? describeError(failure) : undefined,
    })
    const delay = Math.min(15_000, 500 * 2 ** Math.min(attempt, 5)) * (0.75 + Math.random() * 0.5)
    await new Promise<void>((resolve) => {
      const timer = setTimeout(done, delay)
      function done() {
        clearTimeout(timer)
        wakeSleep = null
        ctrl.signal.removeEventListener("abort", done)
        resolve()
      }
      wakeSleep = done
      ctrl.signal.addEventListener("abort", done, { once: true })
    })
  }
}

function onConnected(b: Backend) {
  setConn({ status: "live", error: undefined, attempt: 0 })
  lastActivity.value = Date.now()
  resync(b)
}

// Forces a fresh stream now: used when the tab comes back to the foreground or the network returns, because a
// suspended mobile tab can hold a dead connection that still looks open.
function kick() {
  if (!lifecycle) return
  stream?.abort()
  wakeSleep?.()
}

function tick(b: Backend) {
  if (!lifecycle) return
  const idle = Date.now() - lastActivity.value
  if (conn.value.status === "live" && idle > HEARTBEAT_STALE_MS) {
    setConn({ status: "reconnecting", error: "No heartbeat from the server" })
    kick()
  }
  if (conn.value.status === "live" && document.visibilityState === "visible" && Date.now() - lastPing > 30_000)
    measureLatency(b)
}

let lastPing = 0
export async function measureLatency(b = backend.value) {
  if (!b) return
  lastPing = Date.now()
  const started = performance.now()
  try {
    await b.info(AbortSignal.timeout(10_000))
    setConn({ latency: Math.round(performance.now() - started) })
  } catch {
    setConn({ latency: undefined })
  }
}

if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") return
    attention.value = 0
    if (!lifecycle) return
    if (conn.value.status !== "live" || Date.now() - lastActivity.value > RESUME_CHECK_MS) kick()
  })
  window.addEventListener("online", () => kick())
  window.addEventListener("offline", () => lifecycle && setConn({ status: "offline" }))
  window.addEventListener("pageshow", (e) => {
    if ((e as PageTransitionEvent).persisted) kick()
  })
}

// ---------------------------------------------------------------------------------------------------------------
// Workspace data for the connected server

export type Thread = { messages: Message[]; older?: string; loading: boolean; loaded: boolean; loadingOlder?: boolean }

export const projects = signal<Project[]>([])
export const directory = signal<string | null>(null)
export const home = signal<string | undefined>(undefined)
export const sessionMap = signal<Record<string, Session>>({})
export const sessionOrder = signal<string[]>([])
export const sessionsLoading = signal(false)
export const sessionSearch = signal("")
export const busy = signal<Record<string, true>>({})
export const retrying = signal<Record<string, string>>({})
export const currentSessionID = signal<string | null>(null)
export const threads = signal<Record<string, Thread>>({})
export const permissions = signal<Permission[]>([])
export const forms = signal<Form[]>([])
export const models = signal<Model[]>([])
export const defaultModel = signal<ModelRef | undefined>(undefined)
export const agents = signal<Agent[]>([])
export const commands = signal<Command[]>([])
export const draft = signal<{ model?: ModelRef; agent?: string }>({})
// Explicit picks. On 1.x (model sent per prompt) they always win over what the server last used. On v2 they bridge
// the gap until the server confirms the switch, so a session refresh that started earlier cannot undo the pick.
export const localChoice = signal<Record<string, { model?: ModelRef; agent?: string }>>({})

function setChoice(sid: string, patch: { model?: ModelRef; agent?: string } | null, key?: "model" | "agent") {
  const current = { ...localChoice.value[sid] }
  if (patch) Object.assign(current, patch)
  else if (key) delete current[key]
  localChoice.value = { ...localChoice.value, [sid]: current }
}

const sameModel = (a?: ModelRef, b?: ModelRef) =>
  !!a && !!b && a.providerID === b.providerID && a.id === b.id && (a.variant ?? "default") === (b.variant ?? "default")
export const promptText = signal("")
export const attention = signal(0)
export const changesView = signal<{ sessionID: string; from?: string; to?: string; title: string } | undefined>(undefined)

export function showSessionChanges(sessionID: string) {
  const users = (threads.value[sessionID]?.messages ?? []).filter((m) => m.kind === "user")
  changesView.value = { sessionID, from: users[0]?.id, to: users[users.length - 1]?.id, title: "Changes in this session" }
}

export const currentSession = computed(() => (currentSessionID.value ? sessionMap.value[currentSessionID.value] : undefined))
export const currentThread = computed(() => (currentSessionID.value ? threads.value[currentSessionID.value] : undefined))
export const sessionList = computed(() => sessionOrder.value.map((id) => sessionMap.value[id]).filter((s): s is Session => !!s))
export const currentProject = computed(() => projects.value.find((p) => p.directory === directory.value))

// The model/agent the prompt bar shows: the session's own, else the last one used in it, else the draft/default.
export const selectedModel = computed<ModelRef | undefined>(() => {
  const s = currentSession.value
  const picked = s ? localChoice.value[s.id]?.model : undefined
  if (picked) return picked
  if (s?.model) return s.model
  const last = lastAssistant(currentThread.value?.messages)
  if (last?.model) return last.model
  return draft.value.model ?? defaultModel.value
})
export const selectedAgent = computed<string>(() => {
  const s = currentSession.value
  return (s ? localChoice.value[s.id]?.agent : undefined) ?? s?.agent ?? lastAssistant(currentThread.value?.messages)?.agent ?? draft.value.agent ?? agents.value[0]?.id ?? "build"
})

function lastAssistant(messages?: Message[]) {
  if (!messages) return
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]
    if (m.kind === "assistant") return m
  }
}

function resetWorkspace() {
  projects.value = []
  directory.value = null
  home.value = undefined
  sessionMap.value = {}
  sessionOrder.value = []
  busy.value = {}
  retrying.value = {}
  currentSessionID.value = null
  threads.value = {}
  permissions.value = []
  forms.value = []
  models.value = []
  defaultModel.value = undefined
  agents.value = []
  commands.value = []
  draft.value = {}
  localChoice.value = {}
  sessionSearch.value = ""
}

async function resync(b: Backend) {
  const sid = currentSessionID.value
  await Promise.allSettled([
    loadProjects(b).then(() => ensureDirectory(b)),
    loadBusy(b),
    b.home().then((h) => (home.value = h)),
  ])
  // Sessions load before the open one is re-fetched: 1.x needs to know which project folder a session lives in.
  await Promise.allSettled([
    loadSessions(b).then(() => (sid ? openSession(sid, { quiet: true }) : undefined)),
    loadCatalog(b),
    loadPending(b),
  ])
}

async function ensureDirectory(b: Backend) {
  if (directory.value) return
  const recent = projects.value[0]?.directory ?? (await b.home())
  if (recent) directory.value = recent
}

export async function loadProjects(b = backend.value) {
  if (!b) return
  try {
    projects.value = await b.projects()
  } catch (error) {
    fail(error, "Loading projects")
  }
}

let sessionsRequest = 0
export async function loadSessions(b = backend.value) {
  if (!b || !directory.value) return
  const req = ++sessionsRequest
  sessionsLoading.value = true
  try {
    const project = projects.value.find((p) => p.directory === directory.value)
    const list = await b.sessions({
      projectID: project?.id,
      directory: directory.value,
      search: sessionSearch.value.trim() || undefined,
    })
    if (req !== sessionsRequest) return
    batch(() => {
      const map = { ...sessionMap.value }
      for (const s of list) map[s.id] = { ...map[s.id], ...s }
      sessionMap.value = map
      sessionOrder.value = list.filter((s) => !s.parentID).map((s) => s.id)
    })
  } catch (error) {
    if (req === sessionsRequest) fail(error, "Loading sessions")
  } finally {
    if (req === sessionsRequest) sessionsLoading.value = false
  }
}

async function loadBusy(b: Backend) {
  try {
    const ids = await b.busySessions()
    busy.value = Object.fromEntries(ids.map((id) => [id, true as const]))
  } catch {}
}

export async function loadCatalog(b = backend.value) {
  if (!b) return
  const dir = directory.value ?? undefined
  const [m, a, c] = await Promise.allSettled([b.models(dir), b.agents(dir), b.commands(dir)])
  batch(() => {
    if (m.status === "fulfilled") {
      models.value = m.value.models
      defaultModel.value = m.value.default ?? (m.value.models[0] ? { providerID: m.value.models[0].providerID, id: m.value.models[0].id } : undefined)
    }
    if (a.status === "fulfilled") agents.value = a.value
    if (c.status === "fulfilled") commands.value = c.value
  })
  if (m.status === "rejected") fail(m.reason, "Loading models")
}

async function loadPending(b: Backend) {
  const dirs = new Set<string | undefined>([directory.value ?? undefined])
  for (const id of Object.keys(busy.value)) {
    const d = sessionMap.value[id]?.directory
    if (d) dirs.add(d)
  }
  const perms: Permission[] = []
  const fs: Form[] = []
  await Promise.allSettled(
    [...dirs].map(async (d) => {
      const [p, f] = await Promise.allSettled([b.permissions(d), b.forms(d)])
      if (p.status === "fulfilled") perms.push(...p.value)
      if (f.status === "fulfilled") fs.push(...f.value)
    }),
  )
  batch(() => {
    permissions.value = dedupe(perms)
    forms.value = dedupe(fs)
  })
}

function dedupe<T extends { id: string }>(list: T[]) {
  return [...new Map(list.map((x) => [x.id, x])).values()]
}

export async function setDirectory(dir: string) {
  const b = backend.value
  if (!b) return
  batch(() => {
    directory.value = dir
    sessionSearch.value = ""
    if (currentSession.value && currentSession.value.directory !== dir) currentSessionID.value = null
    draft.value = {}
  })
  const record = activeServer.value
  if (record) updateServer(record.id, { lastDirectory: dir, lastSession: currentSessionID.value ?? undefined })
  await Promise.allSettled([loadSessions(b), loadCatalog(b), loadPending(b)])
}

// ---------------------------------------------------------------------------------------------------------------
// Sessions and messages

// Unsent text is kept per session, so switching sessions does not carry a draft into the wrong conversation.
const drafts = new Map<string, string>()
function swapDraft(next: string | null) {
  drafts.set(currentSessionID.value ?? "new", promptText.value)
  promptText.value = drafts.get(next ?? "new") ?? ""
}

export async function openSession(id: string, opts: { quiet?: boolean } = {}) {
  const b = backend.value
  if (!b) return
  if (currentSessionID.value !== id) {
    swapDraft(id)
    currentSessionID.value = id
    const record = activeServer.value
    if (record) updateServer(record.id, { lastSession: id })
  }
  if (!threads.value[id]) setThread(id, { messages: [], loading: true, loaded: false })
  try {
    const [info, page] = await Promise.all([b.session(id), b.messages(id)])
    upsertSession(info)
    mergePage(id, page)
    if (info.directory && info.directory !== directory.value) {
      directory.value = info.directory
      loadSessions(b)
      loadCatalog(b)
    }
  } catch (error) {
    patchThread(id, { loading: false })
    if (!opts.quiet) fail(error, "Opening session")
    if (currentSessionID.value === id && !sessionMap.value[id]) currentSessionID.value = null
  }
}

export function newSession() {
  if (currentSessionID.value !== null) swapDraft(null)
  currentSessionID.value = null
  const record = activeServer.value
  if (record) updateServer(record.id, { lastSession: undefined })
}

export async function loadOlder(id: string) {
  const b = backend.value
  const thread = threads.value[id]
  if (!b || !thread?.older || thread.loadingOlder) return
  patchThread(id, { loadingOlder: true })
  try {
    const page = await b.messages(id, { cursor: thread.older })
    const t = threads.value[id]
    const known = new Set(t.messages.map((m) => m.id))
    setThread(id, {
      ...t,
      loadingOlder: false,
      older: page.older,
      messages: [...page.messages.filter((m) => !known.has(m.id)), ...t.messages],
    })
  } catch (error) {
    patchThread(id, { loadingOlder: false })
    fail(error, "Loading earlier messages")
  }
}

function setThread(id: string, thread: Thread) {
  threads.value = { ...threads.value, [id]: thread }
}

function patchThread(id: string, patch: Partial<Thread>) {
  const t = threads.value[id]
  if (t) setThread(id, { ...t, ...patch })
}

function isStreaming(m: Message) {
  return m.kind === "assistant" && m.parts.some((p) => (p.type === "text" || p.type === "reasoning") && p.streaming)
}

// Server pages are the source of truth, except for a message that is still streaming locally: replacing it would
// drop deltas that arrived after the server built its response.
function mergePage(id: string, page: MessagePage) {
  const t = threads.value[id]
  const local = new Map((t?.messages ?? []).map((m) => [m.id, m]))
  const merged = page.messages.map((m) => {
    const mine = local.get(m.id)
    // Once the server says the message is complete, its copy wins even if a "text ended" event was missed.
    const finished = m.kind === "assistant" && m.completed !== undefined
    return mine && isStreaming(mine) && !finished ? mine : m
  })
  const first = page.messages[0]?.created ?? Infinity
  const pageIds = new Set(page.messages.map((m) => m.id))
  const keptOlder = (t?.messages ?? []).filter((m) => m.created < first && !pageIds.has(m.id) && !m.id.startsWith("local:"))
  // Keep local streaming or pending messages the page does not know about yet.
  const keptNewer = (t?.messages ?? []).filter(
    (m) => !pageIds.has(m.id) && m.created >= first && (isStreaming(m) || (m.kind === "user" && m.pending)),
  )
  const all = [...keptOlder, ...merged, ...keptNewer].sort((a, b) => a.created - b.created)
  setThread(id, {
    messages: all,
    older: keptOlder.length ? t?.older : page.older,
    loading: false,
    loaded: true,
    loadingOlder: t?.loadingOlder,
  })
}

const refreshTimers = new Map<string, ReturnType<typeof setTimeout>>()

// Only sessions opened in this tab are re-fetched. Activity elsewhere (other sessions, other devices) just bumps the
// list entry, so a busy server does not turn every event into extra requests from every connected tab.
function scheduleRefresh(sessionID: string, messages = true) {
  if (!threads.value[sessionID]) {
    if (sessionMap.value[sessionID]) upsertSession({ id: sessionID, updated: Date.now() })
    return
  }
  clearTimeout(refreshTimers.get(sessionID))
  refreshTimers.set(
    sessionID,
    setTimeout(async () => {
      refreshTimers.delete(sessionID)
      const b = backend.value
      if (!b) return
      try {
        const loaded = threads.value[sessionID]?.loaded
        const [info, page] = await Promise.all([
          b.session(sessionID),
          messages && loaded ? b.messages(sessionID) : Promise.resolve(undefined),
        ])
        upsertSession(info)
        if (page) mergePage(sessionID, page)
      } catch {}
    }, 150),
  )
}

function upsertSession(patch: Partial<Session> & { id: string }) {
  const prev: Session | undefined = sessionMap.value[patch.id]
  const defaults = { cost: 0, tokens: { input: 0, output: 0, reasoning: 0, cacheRead: 0 }, created: Date.now(), updated: Date.now(), directory: "" }
  const next = { ...defaults, ...prev, ...patch } as Session
  if ("revert" in patch && patch.revert === undefined) delete next.revert
  sessionMap.value = { ...sessionMap.value, [patch.id]: next }
  // Once a server-side model/agent matches the local pick, the server is the source of truth again.
  const pick = localChoice.value[patch.id]
  if (pick && backend.value?.serverModelState) {
    if (pick.model && sameModel(pick.model, patch.model)) setChoice(patch.id, null, "model")
    if (pick.agent && patch.agent === pick.agent) setChoice(patch.id, null, "agent")
  }
  if (!prev && next.directory === directory.value && !next.parentID && !sessionOrder.value.includes(next.id))
    sessionOrder.value = [next.id, ...sessionOrder.value]
}

function updateMessages(sessionID: string, fn: (messages: Message[]) => Message[]) {
  const t = threads.value[sessionID]
  if (!t) return
  const next = fn(t.messages)
  if (next !== t.messages) setThread(sessionID, { ...t, messages: next })
}

function updateAssistant(sessionID: string, messageID: string, fn: (m: AssistantMessage) => AssistantMessage) {
  updateMessages(sessionID, (messages) => {
    const i = messages.findIndex((m) => m.id === messageID)
    if (i === -1) {
      const fresh: AssistantMessage = { kind: "assistant", id: messageID, created: Date.now(), parts: [] }
      return [...messages, fn(fresh)]
    }
    const m = messages[i]
    if (m.kind !== "assistant") return messages
    const copy = messages.slice()
    copy[i] = fn(m)
    return copy
  })
}

function updatePart<T extends AssistantPart>(m: AssistantMessage, key: string, create: () => T, fn: (p: T) => T): AssistantMessage {
  const i = m.parts.findIndex((p) => p.key === key)
  const parts = m.parts.slice()
  if (i === -1) parts.push(fn(create()))
  else parts[i] = fn(parts[i] as T)
  return { ...m, parts }
}

function apply(event: BackendEvent) {
  switch (event.type) {
    case "session.upsert":
      upsertSession(event.session)
      return
    case "session.deleted":
      removeLocalSession(event.sessionID)
      return
    case "session.busy": {
      const was = !!busy.value[event.sessionID]
      if (event.busy) busy.value = { ...busy.value, [event.sessionID]: true }
      else if (was) {
        const { [event.sessionID]: _, ...rest } = busy.value
        busy.value = rest
        notify("Session finished", sessionMap.value[event.sessionID]?.title)
      }
      if (event.retry) retrying.value = { ...retrying.value, [event.sessionID]: event.retry }
      else if (retrying.value[event.sessionID]) {
        const { [event.sessionID]: _, ...rest } = retrying.value
        retrying.value = rest
      }
      return
    }
    case "session.invalidate":
      scheduleRefresh(event.sessionID, event.messages)
      return
    case "message.user":
      updateMessages(event.sessionID, (messages) => {
        const i = messages.findIndex((m) => m.id === event.messageID)
        if (i !== -1) {
          const m = messages[i]
          if (m.kind !== "user" || !!m.pending === !!event.pending) return messages
          const copy = messages.slice()
          copy[i] = { ...m, pending: event.pending }
          return copy
        }
        return [
          ...messages,
          { kind: "user", id: event.messageID, created: Date.now(), text: event.text, attachments: [], pending: event.pending },
        ]
      })
      return
    case "message.assistant":
      updateAssistant(event.sessionID, event.messageID, (m) => ({ ...m, agent: event.agent ?? m.agent, model: event.model ?? m.model }))
      return
    case "part.text":
      updateAssistant(event.sessionID, event.messageID, (m) =>
        updatePart<TextPart | ReasoningPart>(
          m,
          event.key,
          () => ({ type: event.kind, key: event.key, text: "", streaming: true }),
          (p) =>
            // A delta that arrives after the part was marked done (events can cross) would duplicate text.
            p.streaming === false && !event.done && event.text === undefined
              ? p
              : {
                  ...p,
                  text: event.text !== undefined && (event.done || !p.text) ? event.text : p.text + (event.delta ?? ""),
                  streaming: !event.done,
                },
        ),
      )
      return
    case "part.tool":
      updateAssistant(event.sessionID, event.messageID, (m) =>
        updatePart<ToolPart>(
          m,
          `tool:${event.tool.id}`,
          () => ({ type: "tool", key: `tool:${event.tool.id}`, id: event.tool.id, name: event.tool.name ?? "tool", status: "pending" }),
          (p) => ({
            ...p,
            ...stripUndefined(event.tool),
            inputText: event.inputDelta !== undefined ? (p.inputText ?? "") + event.inputDelta : (event.tool.inputText ?? p.inputText),
          }),
        ),
      )
      return
    case "permission.asked":
      if (!permissions.value.some((p) => p.id === event.permission.id)) {
        permissions.value = [...permissions.value, event.permission]
        notify("Permission needed", `${event.permission.action}: ${event.permission.resources.join(", ")}`)
      }
      return
    case "permission.replied":
      permissions.value = permissions.value.filter((p) => p.id !== event.id)
      return
    case "form.created":
      if (!forms.value.some((f) => f.id === event.form.id)) {
        forms.value = [...forms.value, event.form]
        notify("Question from the agent", event.form.fields[0]?.description ?? event.form.title)
      }
      return
    case "form.done":
      forms.value = forms.value.filter((f) => f.id !== event.id)
      return
    case "projects.invalidate":
      if (event.directory && projects.value.some((p) => p.directory === event.directory)) return
      clearTimeout(projectsTimer)
      projectsTimer = setTimeout(() => loadProjects(), 500)
      return
  }
}
let projectsTimer: ReturnType<typeof setTimeout> | undefined

function stripUndefined<T extends object>(obj: T): Partial<T> {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as Partial<T>
}

function removeLocalSession(id: string) {
  batch(() => {
    const { [id]: _, ...rest } = sessionMap.value
    sessionMap.value = rest
    sessionOrder.value = sessionOrder.value.filter((s) => s !== id)
    const { [id]: __, ...threadsRest } = threads.value
    threads.value = threadsRest
    if (currentSessionID.value === id) currentSessionID.value = null
  })
}

// ---------------------------------------------------------------------------------------------------------------
// Actions

function need() {
  const b = backend.value
  if (!b) throw new Error("Not connected")
  return b
}

export async function sendPrompt(text: string, files: PromptFile[]) {
  const b = need()
  const trimmed = text.trim()
  if (!trimmed && !files.length) return false
  let sid = currentSessionID.value
  try {
    if (!sid) {
      if (!directory.value) throw new Error("Pick a project folder first")
      const created = await b.createSession({ directory: directory.value, model: selectedModel.value, agent: selectedAgent.value })
      upsertSession(created)
      sid = created.id
      currentSessionID.value = sid
      setThread(sid, { messages: [], loading: false, loaded: true })
      const record = activeServer.value
      if (record) updateServer(record.id, { lastSession: sid })
    }
    const session = sessionMap.value[sid]
    if (session?.revert) await b.commitRevert(sid)
    busy.value = { ...busy.value, [sid]: true as const }
    if (trimmed.startsWith("!") && !files.length) {
      await b.shell(sid, trimmed.slice(1).trim())
    } else if (trimmed.startsWith("/") && !files.length) {
      const [name, ...rest] = trimmed.slice(1).split(/\s+/)
      if (commands.value.some((c) => c.name === name)) await b.command(sid, name, rest.join(" "))
      else await b.prompt(sid, { text: trimmed, files })
    } else {
      await b.prompt(sid, { text: trimmed, files, model: selectedModel.value, agent: selectedAgent.value })
    }
    scheduleRefresh(sid)
    return true
  } catch (error) {
    if (sid) {
      const { [sid]: _, ...rest } = busy.value
      busy.value = rest
    }
    fail(error, "Sending")
    return false
  }
}

export async function interrupt() {
  const sid = currentSessionID.value
  if (!sid) return
  try {
    await need().interrupt(sid)
  } catch (error) {
    fail(error, "Stopping")
  }
}

export async function chooseModel(model: ModelRef) {
  const sid = currentSessionID.value
  if (!sid) {
    draft.value = { ...draft.value, model }
    return
  }
  setChoice(sid, { model })
  if (!need().serverModelState) return
  try {
    await need().switchModel(sid, model)
  } catch (error) {
    setChoice(sid, null, "model")
    fail(error, "Switching model")
  }
}

export async function chooseAgent(agent: string) {
  const sid = currentSessionID.value
  if (!sid) {
    draft.value = { ...draft.value, agent }
    return
  }
  setChoice(sid, { agent })
  if (!need().serverModelState) return
  try {
    await need().switchAgent(sid, agent)
  } catch (error) {
    setChoice(sid, null, "agent")
    fail(error, "Switching agent")
  }
}

export async function renameSession(id: string, title: string) {
  try {
    await need().renameSession(id, title)
    upsertSession({ id, title })
  } catch (error) {
    fail(error, "Renaming")
  }
}

export async function deleteSession(id: string) {
  try {
    await need().deleteSession(id)
    removeLocalSession(id)
    toast("Session deleted", "success")
  } catch (error) {
    fail(error, "Deleting")
  }
}

export async function forkSession(id: string, beforeMessageID?: string) {
  try {
    const s = await need().forkSession(id, beforeMessageID)
    upsertSession(s)
    if (!sessionOrder.value.includes(s.id)) sessionOrder.value = [s.id, ...sessionOrder.value]
    await openSession(s.id)
    toast("Forked into a new session", "success")
  } catch (error) {
    fail(error, "Forking")
  }
}

export async function compactSession(id: string) {
  try {
    await need().compactSession(id)
    toast("Compacting context…")
  } catch (error) {
    fail(error, "Compacting")
  }
}

export async function revertTo(messageID: string) {
  const sid = currentSessionID.value
  if (!sid) return
  const message = threads.value[sid]?.messages.find((m) => m.id === messageID)
  try {
    if (busy.value[sid]) await need().interrupt(sid)
    await need().revert(sid, messageID)
    if (message?.kind === "user" && !promptText.value.trim()) promptText.value = message.text
    scheduleRefresh(sid)
  } catch (error) {
    fail(error, "Reverting")
  }
}

export async function undoRevert() {
  const sid = currentSessionID.value
  if (!sid) return
  try {
    await need().unrevert(sid)
    upsertSession({ id: sid, revert: undefined })
    scheduleRefresh(sid)
  } catch (error) {
    fail(error, "Restoring")
  }
}

export async function commitRevert() {
  const sid = currentSessionID.value
  if (!sid) return
  try {
    await need().commitRevert(sid)
    upsertSession({ id: sid, revert: undefined })
    scheduleRefresh(sid)
  } catch (error) {
    fail(error, "Discarding")
  }
}

export async function answerPermission(p: Permission, decision: "once" | "always" | "reject", message?: string) {
  permissions.value = permissions.value.filter((x) => x.id !== p.id)
  try {
    await need().replyPermission(p, decision, message)
  } catch (error) {
    permissions.value = [...permissions.value, p]
    fail(error, "Replying")
  }
}

export async function answerForm(f: Form, answer: Record<string, string | number | boolean | string[]>) {
  forms.value = forms.value.filter((x) => x.id !== f.id)
  try {
    await need().replyForm(f, answer)
  } catch (error) {
    forms.value = [...forms.value, f]
    fail(error, "Answering")
  }
}

export async function dismissForm(f: Form) {
  forms.value = forms.value.filter((x) => x.id !== f.id)
  try {
    await need().cancelForm(f)
  } catch (error) {
    forms.value = [...forms.value, f]
    fail(error, "Dismissing")
  }
}

export function projectLabel(dir: string | null) {
  if (!dir) return "No project"
  return projects.value.find((p) => p.directory === dir)?.name ?? basename(dir)
}

// ---------------------------------------------------------------------------------------------------------------
// Attention: title badge and optional system notifications while the tab is in the background

effect(() => {
  const n = attention.value
  const base = "OC Remote"
  document.title = n ? `(${n}) ${base}` : base
})

function notify(title: string, body?: string) {
  if (document.visibilityState === "visible") return
  attention.value++
  if (!prefs.value.notify || typeof Notification === "undefined" || Notification.permission !== "granted") return
  try {
    new Notification(title, { body: body?.slice(0, 140), tag: "oc-remote", icon: "./icon-192.png" })
  } catch {}
}
