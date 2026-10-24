// Turns whatever the user scanned or pasted into a connection request.
//
// `opencode pair` prints one-time links (https://host/auth/connect/<code>) and a QR code holding
// {"code": "...", "urls": ["http://192.168.1.4:49374", "https://x.tunnel..."]}. The code is single use and expires
// after 5 minutes; exchanging it with a fetch (not a page navigation) returns a 30-day session token that works as
// the Basic-auth password for user "opencode".

export type PairRequest = { type: "pair"; urls: string[]; code: string }
export type PasswordRequest = { type: "password"; url: string; username: string; password: string }
export type AddressRequest = { type: "address"; url: string }
export type ConnectRequest = PairRequest | PasswordRequest | AddressRequest

const CODE = /^[A-Za-z0-9_-]{6,}$/

export function normalizeServerUrl(value: string) {
  let text = value.trim()
  if (!text) return
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(text)) text = (isLoopbackHost(text.split(/[/:]/)[0]) ? "http://" : "https://") + text
  const url = safeUrl(text)
  if (!url || (url.protocol !== "http:" && url.protocol !== "https:")) return
  url.hash = ""
  url.search = ""
  url.username = ""
  url.password = ""
  return url.href.replace(/\/+$/, "")
}

function safeUrl(text: string) {
  try {
    return new URL(text)
  } catch {
    return null
  }
}

export function parseConnectInput(raw: string): ConnectRequest | undefined {
  const text = raw.trim()
  if (!text) return

  if (text.startsWith("{")) {
    try {
      const data = JSON.parse(text) as { code?: unknown; urls?: unknown }
      if (typeof data.code === "string" && CODE.test(data.code) && Array.isArray(data.urls)) {
        const urls = data.urls.map((u) => (typeof u === "string" ? normalizeServerUrl(u) : undefined))
        const valid = urls.filter((u): u is string => !!u)
        if (valid.length) return { type: "pair", code: data.code, urls: [...new Set(valid)] }
      }
    } catch {}
    return
  }

  const url = safeUrl(/^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `https://${text}`)
  if (!url || (url.protocol !== "http:" && url.protocol !== "https:")) return

  // A link to this app carrying the pairing payload in its fragment, e.g. https://app/#pair=<link or json>
  const pairFragment = new URLSearchParams(url.hash.slice(1)).get("pair")
  if (pairFragment) return parseConnectInput(pairFragment)

  const match = /^(.*)\/auth\/connect\/([^/]+)\/?$/.exec(url.pathname)
  if (match && CODE.test(match[2])) {
    const base = normalizeServerUrl(url.origin + match[1])
    if (base) return { type: "pair", code: match[2], urls: [base] }
  }

  const base = normalizeServerUrl(url.href)
  if (!base) return
  if (url.username || url.password) {
    return {
      type: "password",
      url: base,
      username: decodeURIComponent(url.username) || "opencode",
      password: decodeURIComponent(url.password),
    }
  }
  return { type: "address", url: base }
}

export function isLoopbackHost(host: string) {
  const h = host.replace(/^\[|\]$/g, "").toLowerCase()
  return h === "localhost" || h.endsWith(".localhost") || h === "::1" || /^127\./.test(h)
}

export function isPrivateHost(host: string) {
  const h = host.replace(/^\[|\]$/g, "").toLowerCase()
  if (h.endsWith(".local")) return true
  if (/^10\./.test(h) || /^192\.168\./.test(h) || /^169\.254\./.test(h)) return true
  const m = /^172\.(\d+)\./.exec(h)
  if (m && Number(m[1]) >= 16 && Number(m[1]) <= 31) return true
  if (/^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(h)) return true // CGNAT range, used by Tailscale
  return /^f[cd][0-9a-f]{2}:/.test(h) || /^fe80:/.test(h)
}

// Browsers block http:// requests from an https:// page ("mixed content"), except to loopback addresses.
export function blockedAsMixedContent(serverUrl: string, pageProtocol = globalThis.location?.protocol) {
  const url = safeUrl(serverUrl)
  if (!url) return false
  return pageProtocol === "https:" && url.protocol === "http:" && !isLoopbackHost(url.hostname)
}

// Prefer addresses the browser can actually reach: https first, then http ones not blocked as mixed content.
export function orderPairingUrls(urls: string[], pageProtocol = globalThis.location?.protocol) {
  const score = (u: string) => {
    if (u.startsWith("https:")) return 0
    if (!blockedAsMixedContent(u, pageProtocol)) return 1
    return 2
  }
  return [...urls].sort((a, b) => score(a) - score(b))
}

export function tokenExpiry(token: string) {
  const seconds = Number(token.split(".")[0])
  return Number.isSafeInteger(seconds) && seconds > 1_000_000_000 ? seconds * 1000 : undefined
}

export function basicAuth(username: string, secret: string) {
  const bytes = new TextEncoder().encode(`${username}:${secret}`)
  let binary = ""
  for (const b of bytes) binary += String.fromCharCode(b)
  return "Basic " + btoa(binary)
}
