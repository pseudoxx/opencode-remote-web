import { OpenCode } from "@opencode/client"
import { basicAuth, blockedAsMixedContent, isPrivateHost, orderPairingUrls, tokenExpiry } from "./pairing"
import type { ServerRecord } from "./storage"
import type { Backend, ServerKind } from "./types"
import { createV2 } from "./v2"
import { createV1 } from "./v1"

export class ConnectError extends Error {
  constructor(
    readonly reason: "unauthorized" | "cors" | "unreachable" | "mixed-content" | "expired-code" | "not-opencode" | "http",
    message: string,
    readonly url?: string,
  ) {
    super(message)
  }
}

const REQUEST_TIMEOUT = 30_000

// Every request: Basic auth header, no cookies, no caching. Plain requests time out; the event stream does not.
export function transport(url: string, auth: string | undefined): typeof fetch {
  const host = new URL(url).hostname
  const local = isPrivateHost(host)
  return (input, init) => {
    const headers = new Headers(init?.headers)
    if (auth) headers.set("authorization", auth)
    const target = typeof input === "string" ? input : input instanceof URL ? input.href : input.url
    const streaming = /\/(api\/)?event(\?|$)/.test(new URL(target).pathname + "?")
    const signals = [init?.signal, streaming ? undefined : AbortSignal.timeout(REQUEST_TIMEOUT)].filter(
      (s): s is AbortSignal => !!s,
    )
    const request: RequestInit & { targetAddressSpace?: string } = {
      ...init,
      headers,
      credentials: "omit",
      cache: "no-store",
      signal: signals.length > 1 ? AbortSignal.any(signals) : signals[0],
    }
    // Chrome's Local Network Access: lets an https page reach a LAN server after the user grants permission.
    if (local) request.targetAddressSpace = "local"
    return fetch(input, request)
  }
}

export function authHeader(record: Pick<ServerRecord, "username" | "secret">) {
  return record.secret ? basicAuth(record.username || "opencode", record.secret) : undefined
}

async function getJson(fetcher: typeof fetch, url: string, signal?: AbortSignal) {
  const res = await fetcher(url, { signal, headers: { accept: "application/json" } })
  let body: unknown
  try {
    body = await res.json()
  } catch {
    body = undefined
  }
  return { status: res.status, body }
}

// Works out which OpenCode API the server speaks. v2 (@opencode/cli, the desktop app) answers /api/info with JSON;
// 1.x (opencode-ai) answers /global/health with JSON. Each server answers the other's route with its web UI (HTML),
// and on 1.x that route can be slow while the UI loads, so both are probed at once and the first JSON answer wins.
export async function detect(url: string, auth: string | undefined, signal?: AbortSignal): Promise<{ kind: ServerKind; version: string }> {
  const fetcher = transport(url, auth)
  const ctrl = new AbortController()
  const stop = () => ctrl.abort()
  signal?.addEventListener("abort", stop, { once: true })
  const probes: Array<[ServerKind, string]> = [
    ["v2", `${url}/api/info`],
    ["v1", `${url}/global/health`],
  ]
  try {
    return await new Promise((resolve, reject) => {
      let remaining = probes.length
      let lastStatus = 0
      let networkError: unknown
      const finish = () => {
        if (--remaining > 0) return
        if (networkError !== undefined && !lastStatus) return diagnose(url, networkError).then(reject)
        reject(new ConnectError("not-opencode", `No OpenCode API found at ${url} (HTTP ${lastStatus}).`, url))
      }
      for (const [kind, probe] of probes) {
        getJson(fetcher, probe, ctrl.signal).then(
          ({ status, body }) => {
            lastStatus = lastStatus || status
            if (status === 401) return reject(new ConnectError("unauthorized", "The server rejected these credentials.", url))
            const version = (body as { version?: unknown } | undefined)?.version
            if (status === 200 && typeof version === "string") return resolve({ kind, version })
            finish()
          },
          (error) => {
            if (signal?.aborted) return reject(error)
            networkError = error
            finish()
          },
        )
      }
    })
  } finally {
    ctrl.abort()
    signal?.removeEventListener("abort", stop)
  }
}

// fetch() only says "Failed to fetch". Work out why so the user gets an actionable fix.
export async function diagnose(url: string, cause?: unknown): Promise<ConnectError> {
  if (cause instanceof DOMException && cause.name === "TimeoutError")
    return new ConnectError("unreachable", `Timed out reaching ${url}.`, url)
  if (blockedAsMixedContent(url))
    return new ConnectError(
      "mixed-content",
      "This page is HTTPS, so the browser blocks plain-http servers on other machines. Use an HTTPS address (opencode pair --remote, Tailscale Serve, Cloudflare Tunnel).",
      url,
    )
  try {
    // An opaque no-cors response proves the server answered, so the real failure was the CORS check.
    await fetch(`${url}/api/info`, { mode: "no-cors", credentials: "omit", cache: "no-store", signal: AbortSignal.timeout(8000) })
    return new ConnectError("cors", "The server is reachable but does not allow this app's origin (CORS).", url)
  } catch {
    return new ConnectError("unreachable", `Could not reach ${url}. Check the address, that OpenCode is running, and your network.`, url)
  }
}

// `opencode pair` lists every address the server has, and some (a LAN IP seen from mobile data) will not answer.
// Probe them all at once, then use the most preferred one that answered, so a dead address costs seconds, not a
// full request timeout. The code itself is single use, so it is only sent to one address at a time.
async function answers(url: string, signal?: AbortSignal) {
  const timeout = AbortSignal.timeout(6000)
  try {
    await transport(url, undefined)(`${url}/api/info`, { signal: signal ? AbortSignal.any([signal, timeout]) : timeout, headers: { accept: "application/json" } })
    return true
  } catch {
    return false
  }
}

function firstDefined<T>(promises: Promise<T | undefined>[]) {
  return new Promise<T | undefined>((resolve) => {
    let left = promises.length
    if (!left) resolve(undefined)
    for (const p of promises)
      p.then((v) => {
        if (v !== undefined) resolve(v)
        else if (--left === 0) resolve(undefined)
      })
  })
}

async function reachableFirst(urls: string[], signal?: AbortSignal) {
  if (urls.length < 2) return urls
  const probes = new Map(urls.map((u) => [u, answers(u, signal)]))
  // orderPairingUrls sorts by preference; addresses of equal preference race each other.
  const rank = (u: string) => (u.startsWith("https:") ? 0 : blockedAsMixedContent(u) ? 2 : 1)
  for (const tier of [0, 1, 2]) {
    const group = urls.filter((u) => rank(u) === tier)
    const winner = await firstDefined(group.map((u) => probes.get(u)!.then((ok) => (ok ? u : undefined))))
    if (winner) return [winner, ...urls.filter((u) => u !== winner)]
  }
  return urls
}

export async function exchangePairingCode(urls: string[], code: string, signal?: AbortSignal) {
  const errors: ConnectError[] = []
  for (const url of await reachableFirst(orderPairingUrls(urls), signal)) {
    const fetcher = transport(url, undefined)
    let res: Response
    try {
      res = await fetcher(`${url}/auth/connect/${encodeURIComponent(code)}`, { signal, headers: { accept: "application/json" } })
    } catch (cause) {
      if (signal?.aborted) throw cause
      errors.push(await diagnose(url, cause))
      continue
    }
    if (res.status === 401) throw new ConnectError("expired-code", "This pairing link expired or was already used. Run `opencode pair` again.", url)
    if (!res.ok) {
      errors.push(new ConnectError("http", `Pairing failed at ${url} (HTTP ${res.status}).`, url))
      continue
    }
    const body = (await res.json().catch(() => ({}))) as { token?: string }
    if (!body.token) {
      errors.push(new ConnectError("not-opencode", `${url} did not return a session token.`, url))
      continue
    }
    return { url, token: body.token, expires: tokenExpiry(body.token) }
  }
  throw pickError(errors)
}

// The most useful error to show when several addresses failed.
function pickError(errors: ConnectError[]) {
  const order: ConnectError["reason"][] = ["cors", "expired-code", "http", "not-opencode", "unreachable", "mixed-content"]
  return [...errors].sort((a, b) => order.indexOf(a.reason) - order.indexOf(b.reason))[0] ?? new ConnectError("unreachable", "No server address to try.")
}

export function createBackend(record: ServerRecord, kind: ServerKind, version: string): Backend {
  const fetcher = transport(record.url, authHeader(record))
  if (kind === "v1") return createV1(record.url, fetcher, version)
  return createV2(OpenCode.make({ baseUrl: record.url, fetch: fetcher }), version)
}

export function describeError(error: unknown): string {
  if (error instanceof ConnectError) return error.message
  if (error && typeof error === "object") {
    const e = error as { message?: unknown; _tag?: unknown; reason?: unknown; detail?: unknown; cause?: unknown }
    if (e._tag === "UnauthorizedError") return "Not authorized. Pair this device again."
    if (typeof e.message === "string" && e.message && e.message !== "undefined") {
      if (e.reason === "Transport") return "Network error. The server may be unreachable."
      return e.message
    }
    if (typeof e.reason === "string") return `${e.reason}${e.detail ? `: ${String(e.detail)}` : ""}`
  }
  return String(error)
}

export function isUnauthorized(error: unknown) {
  if (error instanceof ConnectError) return error.reason === "unauthorized"
  const e = error as { _tag?: unknown; cause?: { status?: unknown }; status?: unknown } | undefined
  return e?._tag === "UnauthorizedError" || e?.cause?.status === 401 || e?.status === 401
}
