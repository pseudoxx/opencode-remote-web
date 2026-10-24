import type { ServerKind } from "./types"

// Saved servers live only in this browser. "Remember" puts a server in localStorage; otherwise it goes to
// sessionStorage and disappears when the tab closes. Nothing is ever sent anywhere except the server itself.

export type ServerRecord = {
  id: string
  name: string
  url: string
  username: string
  secret: string
  auth: "token" | "password"
  expires?: number
  kind?: ServerKind
  version?: string
  remember: boolean
  added: number
  lastUsed?: number
  lastDirectory?: string
  lastSession?: string
}

const KEY = "ocr:servers"
const PREFS = "ocr:prefs"

function read(store: () => Storage): ServerRecord[] {
  try {
    const raw = store().getItem(KEY)
    const list = raw ? (JSON.parse(raw) as ServerRecord[]) : []
    return Array.isArray(list) ? list.filter((s) => s && typeof s.url === "string" && typeof s.id === "string") : []
  } catch {
    return []
  }
}

function write(store: () => Storage, list: ServerRecord[]) {
  try {
    if (list.length) store().setItem(KEY, JSON.stringify(list))
    else store().removeItem(KEY)
  } catch {}
}

export function loadServers(): ServerRecord[] {
  const remembered = read(() => localStorage).map((s) => ({ ...s, remember: true }))
  const temporary = read(() => sessionStorage).map((s) => ({ ...s, remember: false }))
  const ids = new Set(remembered.map((s) => s.id))
  return [...remembered, ...temporary.filter((s) => !ids.has(s.id))]
}

export function saveServers(list: ServerRecord[]) {
  write(() => localStorage, list.filter((s) => s.remember))
  write(() => sessionStorage, list.filter((s) => !s.remember))
}

export type Prefs = {
  lastServer?: string
  theme?: "system" | "light" | "dark"
  enterToSend?: boolean
  notify?: boolean
  showReasoning?: boolean
}

export function loadPrefs(): Prefs {
  try {
    return JSON.parse(localStorage.getItem(PREFS) ?? "{}") as Prefs
  } catch {
    return {}
  }
}

export function savePrefs(prefs: Prefs) {
  try {
    localStorage.setItem(PREFS, JSON.stringify(prefs))
  } catch {}
}

export function newId() {
  try {
    return crypto.randomUUID()
  } catch {
    return Math.random().toString(36).slice(2) + Date.now().toString(36)
  }
}
