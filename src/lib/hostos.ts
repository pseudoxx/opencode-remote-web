// Which operating system runs the OpenCode server, so setup help can show commands for that machine.
//
// While the browser blocks the server (CORS), the page cannot read anything it sends, so before the first
// connection this is a guess. After connecting, the server's own paths give a definite answer, which is stored
// with the saved server.

export type HostOS = "macos" | "windows" | "linux"

export const HOST_OS_LABEL: Record<HostOS, string> = { macos: "macOS", windows: "Windows", linux: "Linux" }

// Default ports of OpenCode 2.x's background service (Windows reserves the range macOS/Linux use).
const WINDOWS_SERVICE_PORT = "28894"
const UNIX_SERVICE_PORT = "49374"

// Strong signs first (drive letters, /Users, macOS's per-user temp folders, /home); a plain /tmp only hints at Linux.
export function osFromPaths(paths: Array<string | undefined>): HostOS | undefined {
  const list = paths.filter((p): p is string => !!p)
  for (const p of list) {
    if (/^[A-Za-z]:[\\/]/.test(p) || p.startsWith("\\\\")) return "windows"
    if (/^\/(Users|Volumes)\//.test(p) || /^(\/private)?\/var\/folders\//.test(p)) return "macos"
    if (/^\/(home|root)(\/|$)/.test(p)) return "linux"
  }
  if (list.some((p) => /^\/tmp(\/|$)/.test(p))) return "linux"
}

// The OS of the device running this page. A desktop browser is often on the same machine as OpenCode.
export function deviceOS(): HostOS | "ios" | "android" | undefined {
  const nav = navigator as Navigator & { userAgentData?: { platform?: string } }
  const platform = (nav.userAgentData?.platform || nav.platform || "").toLowerCase()
  const ua = nav.userAgent.toLowerCase()
  if (/iphone|ipad|ipod/.test(ua) || (platform.includes("mac") && nav.maxTouchPoints > 1)) return "ios"
  if (ua.includes("android")) return "android"
  if (platform.includes("mac")) return "macos"
  if (platform.includes("win")) return "windows"
  if (platform.includes("linux") || ua.includes("linux")) return "linux"
}

export type HostGuess = { os: HostOS; reason: string; certain: boolean }

export function guessHostOS(opts: { serverUrl?: string; known?: HostOS; lastPick?: HostOS }): HostGuess {
  if (opts.known) return { os: opts.known, reason: "Detected when this server last connected.", certain: true }
  let port = ""
  try {
    port = opts.serverUrl ? new URL(opts.serverUrl).port : ""
  } catch {}
  if (port === WINDOWS_SERVICE_PORT)
    return { os: "windows", reason: `Guessed from the port: ${WINDOWS_SERVICE_PORT} is OpenCode's default on Windows.`, certain: false }
  const device = deviceOS()
  const desktop = device === "macos" || device === "windows" || device === "linux" ? device : undefined
  const unix = port === UNIX_SERVICE_PORT
  if (opts.lastPick && (!unix || opts.lastPick !== "windows"))
    return { os: opts.lastPick, reason: "Your last choice.", certain: false }
  if (desktop && (!unix || desktop !== "windows"))
    return { os: desktop, reason: "Guessed from this device.", certain: false }
  if (unix) return { os: "macos", reason: `${UNIX_SERVICE_PORT} is OpenCode's default port on macOS and Linux.`, certain: false }
  return { os: "macos", reason: "Pick the computer that runs OpenCode.", certain: false }
}
