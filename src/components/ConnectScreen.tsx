import { useEffect, useRef, useState } from "preact/hooks"
import { Icon } from "./Icon"
import { Cmd, Spinner } from "./ui"
import { CorsFix } from "./HostSetup"
import { QrScanner, decodeImageFile } from "./QrScanner"
import { ConnectError, authHeader, describeError, detect, exchangePairingCode } from "../lib/connect"
import { blockedAsMixedContent, normalizeServerUrl, parseConnectInput, type ConnectRequest } from "../lib/pairing"
import { newId, type ServerRecord } from "../lib/storage"
import type { HostOS } from "../lib/hostos"
import { relativeTime } from "../lib/format"
import { conn, connectServer, failedServer, removeServer, servers, upsertServer } from "../state/store"

type Tab = "scan" | "link" | "password"

function hostLabel(url: string) {
  try {
    const u = new URL(url)
    return u.port ? `${u.hostname}:${u.port}` : u.hostname
  } catch {
    return url
  }
}

export function ConnectScreen({ initial, onInitialUsed }: { initial?: string; onInitialUsed?: () => void }) {
  const [tab, setTab] = useState<Tab>(() => (initial ? "link" : "scan"))
  const [link, setLink] = useState(initial ?? "")
  const [url, setUrl] = useState("")
  const [username, setUsername] = useState("opencode")
  const [password, setPassword] = useState("")
  const [remember, setRemember] = useState(true)
  const [scanning, setScanning] = useState(false)
  const [working, setWorking] = useState<string>()
  const [error, setError] = useState<ConnectError | { reason: "other"; message: string; url?: string }>()
  const photo = useRef<HTMLInputElement>(null)
  const autoStarted = useRef(false)

  const failedConn = conn.value.status === "error" || conn.value.status === "unauthorized"

  async function run(request: ConnectRequest | undefined) {
    if (!request) {
      setError({ reason: "other", message: "That doesn't look like a pairing link, QR code or server address." })
      return
    }
    setError(undefined)
    try {
      let record: ServerRecord
      if (request.type === "pair") {
        setWorking("Pairing…")
        const paired = await exchangePairingCode(request.urls, request.code)
        record = {
          id: newId(),
          name: hostLabel(paired.url),
          url: paired.url,
          username: "opencode",
          secret: paired.token,
          auth: "token",
          expires: paired.expires,
          remember,
          added: Date.now(),
        }
      } else if (request.type === "password") {
        record = {
          id: newId(),
          name: hostLabel(request.url),
          url: request.url,
          username: request.username || "opencode",
          secret: request.password,
          auth: "password",
          remember,
          added: Date.now(),
        }
      } else {
        // A bare address: try without credentials (servers with no password set), else ask for one.
        record = { id: newId(), name: hostLabel(request.url), url: request.url, username: "opencode", secret: "", auth: "password", remember, added: Date.now() }
        setWorking("Checking server…")
        try {
          await detect(record.url, undefined)
        } catch (e) {
          if (e instanceof ConnectError && e.reason === "unauthorized") {
            setUrl(request.url)
            setTab("password")
            setWorking(undefined)
            setError({ reason: "other", message: "This server needs a password (or use a pairing link from `opencode pair`).", url: request.url })
            return
          }
          throw e
        }
      }
      setWorking("Connecting…")
      const { kind, version } = await detect(record.url, authHeader(record))
      const saved = upsertServer({ ...record, kind, version })
      setWorking(undefined)
      setLink("")
      setPassword("")
      await connectServer(saved)
    } catch (e) {
      setWorking(undefined)
      setError(e instanceof ConnectError ? e : { reason: "other", message: describeError(e) })
    }
  }

  useEffect(() => {
    if (initial && !autoStarted.current) {
      autoStarted.current = true
      onInitialUsed?.()
      run(parseConnectInput(initial))
    }
  }, [initial])

  async function pasteFromClipboard() {
    try {
      const text = await navigator.clipboard.readText()
      setLink(text)
      if (text.trim()) run(parseConnectInput(text))
    } catch {
      setError({ reason: "other", message: "Clipboard access was blocked. Long-press the box and paste instead." })
    }
  }

  async function scanPhoto(file?: File) {
    if (!file) return
    setWorking("Reading QR code…")
    const text = await decodeImageFile(file).catch(() => undefined)
    setWorking(undefined)
    if (!text) return setError({ reason: "other", message: "No QR code found in that image. Try a sharper, closer photo." })
    run(parseConnectInput(text))
  }

  const origin = location.origin
  const saved = servers.value

  return (
    <div class="connect">
      <div class="connect-inner">
        <header class="brand">
          <img src="./icon.svg" alt="" width={44} height={44} />
          <div>
            <h1>OC Remote</h1>
            <p class="muted">Control your OpenCode from any browser. Unofficial, open source, no backend.</p>
          </div>
        </header>

        {saved.length > 0 && (
          <section class="card">
            <h2 class="card-title">Your servers</h2>
            <ul class="server-list">
              {saved.map((s) => {
                const expired = s.expires !== undefined && s.expires < Date.now()
                return (
                  <li key={s.id}>
                    <button class="server-item" onClick={() => connectServer(s)} disabled={!!working}>
                      <Icon name="server" />
                      <span class="server-text">
                        <strong>{s.name}</strong>
                        <small class="muted">
                          {s.url}
                          {s.version ? ` · v${s.version}` : ""}
                          {s.lastUsed ? ` · ${relativeTime(s.lastUsed)}` : ""}
                          {expired ? " · pairing expired" : s.expires ? ` · valid until ${new Date(s.expires).toLocaleDateString()}` : ""}
                          {!s.remember ? " · this tab only" : ""}
                        </small>
                      </span>
                      <Icon name="chevronRight" />
                    </button>
                    <button
                      class="icon-btn"
                      aria-label={`Forget ${s.name}`}
                      title="Forget"
                      onClick={() => {
                        if (confirm(`Forget ${s.name}? The saved credentials are removed from this browser.`)) removeServer(s.id)
                      }}
                    >
                      <Icon name="trash" />
                    </button>
                  </li>
                )
              })}
            </ul>
            {failedConn && conn.value.error && (
              <ErrorHelp
                error={{ reason: conn.value.status === "unauthorized" ? "unauthorized" : (conn.value.reason ?? "other"), message: conn.value.error, url: saved.find((s) => s.id === failedServer.value)?.url }}
                origin={origin}
                known={saved.find((s) => s.id === failedServer.value)?.os}
              />
            )}
          </section>
        )}

        <section class="card">
          <h2 class="card-title">{saved.length ? "Add a server" : "Connect to your OpenCode"}</h2>
          <div class="tabs" role="tablist">
            {(
              [
                ["scan", "Scan QR", "qr"],
                ["link", "Paste link", "link"],
                ["password", "Password", "shield"],
              ] as const
            ).map(([id, label, icon]) => (
              <button key={id} role="tab" aria-selected={tab === id} class={tab === id ? "active" : ""} onClick={() => setTab(id)}>
                <Icon name={icon} size={16} /> {label}
              </button>
            ))}
          </div>

          {tab === "scan" && (
            <div class="stack">
              {scanning ? (
                <QrScanner
                  onClose={() => setScanning(false)}
                  onResult={(text) => {
                    setScanning(false)
                    run(parseConnectInput(text))
                  }}
                />
              ) : (
                <div class="scan-actions">
                  <button class="btn primary big" onClick={() => setScanning(true)} disabled={!!working}>
                    <Icon name="camera" /> Scan the QR code
                  </button>
                  <button class="btn" onClick={() => photo.current?.click()} disabled={!!working}>
                    <Icon name="image" /> From a photo
                  </button>
                  <input
                    ref={photo}
                    type="file"
                    accept="image/*"
                    hidden
                    onChange={(e) => {
                      scanPhoto(e.currentTarget.files?.[0])
                      e.currentTarget.value = ""
                    }}
                  />
                </div>
              )}
              <p class="muted small">
                On your computer run <code>opencode pair --remote</code> and scan the code it prints.
              </p>
            </div>
          )}

          {tab === "link" && (
            <form
              class="stack"
              onSubmit={(e) => {
                e.preventDefault()
                run(parseConnectInput(link))
              }}
            >
              <label class="field">
                <span>Pairing link or server address</span>
                <textarea
                  rows={2}
                  placeholder="https://…/auth/connect/…"
                  value={link}
                  onInput={(e) => setLink(e.currentTarget.value)}
                  autoCapitalize="off"
                  autoCorrect="off"
                  spellcheck={false}
                />
              </label>
              <div class="row">
                {"clipboard" in navigator && "readText" in (navigator.clipboard ?? {}) && (
                  <button type="button" class="btn" onClick={pasteFromClipboard} disabled={!!working}>
                    <Icon name="clipboard" /> Paste
                  </button>
                )}
                <button type="submit" class="btn primary grow" disabled={!!working || !link.trim()}>
                  Connect
                </button>
              </div>
            </form>
          )}

          {tab === "password" && (
            <form
              class="stack"
              onSubmit={(e) => {
                e.preventDefault()
                const base = normalizeServerUrl(url)
                if (!base) return setError({ reason: "other", message: "Enter the server address, e.g. https://my-mac.tailnet.ts.net" })
                run({ type: "password", url: base, username, password })
              }}
            >
              <label class="field">
                <span>Server address</span>
                <input
                  type="text"
                  inputMode="url"
                  placeholder="https://my-mac.tailnet.ts.net"
                  value={url}
                  onInput={(e) => setUrl(e.currentTarget.value)}
                  autoCapitalize="off"
                  autoCorrect="off"
                  spellcheck={false}
                  required
                />
              </label>
              <div class="row">
                <label class="field grow">
                  <span>Username</span>
                  <input value={username} onInput={(e) => setUsername(e.currentTarget.value)} autoCapitalize="off" autoCorrect="off" />
                </label>
                <label class="field grow">
                  <span>Password</span>
                  <input type="password" value={password} onInput={(e) => setPassword(e.currentTarget.value)} autoComplete="current-password" />
                </label>
              </div>
              <button type="submit" class="btn primary" disabled={!!working}>
                Connect
              </button>
              <p class="muted small">
                For <code>opencode serve</code> the password is printed at startup or set with <code>OPENCODE_SERVER_PASSWORD</code>.
              </p>
            </form>
          )}

          <label class="check">
            <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.currentTarget.checked)} />
            <span>Remember on this device</span>
          </label>

          {working && (
            <p class="note">
              <Spinner /> {working}
            </p>
          )}
          {error && <ErrorHelp error={error} origin={origin} />}
        </section>

        <details class="card guide">
          <summary>
            <Icon name="sparkle" /> First time? Set up in two steps
          </summary>
          <ol>
            <li>
              <p>
                Allow this app's origin (<code>{origin}</code>) on the computer that runs OpenCode. Once is enough.
              </p>
              <CorsFix origin={origin} />
            </li>
            <li>
              <p>Pair this device:</p>
              <p class="small">
                In the OpenCode desktop app, open <strong>Pairing</strong> → <strong>Pair device</strong> and turn on{" "}
                <strong>Remote access</strong>, then scan the QR code here or use <strong>Copy link</strong> and paste it. With
                the CLI:
              </p>
              <Cmd text="opencode pair --remote" />
              <p class="muted small">
                Remote access gives an HTTPS address that works from anywhere. On the same Wi-Fi with an HTTP page, plain{" "}
                <code>opencode pair</code> works too. Using Tailscale or a tunnel? <code>opencode pair --url https://your-address</code>.
              </p>
            </li>
          </ol>
          <p class="muted small">
            <Icon name="shield" size={14} /> Your credentials are stored only in this browser and are sent only to your
            server. This page has no backend and no analytics.
          </p>
        </details>
      </div>
    </div>
  )
}

function ErrorHelp({ error, origin, known }: { error: { reason: string; message: string; url?: string }; origin: string; known?: HostOS }) {
  return (
    <div class="note error stack">
      <p>
        <Icon name="alert" /> {error.message}
      </p>
      {error.reason === "cors" && (
        <div class="stack">
          <p>Allow this app's origin on the computer running OpenCode, then try again:</p>
          <CorsFix origin={origin} serverUrl={error.url} known={known} />
        </div>
      )}
      {error.reason === "mixed-content" && (
        <p class="small">
          Turn on remote access when pairing (<code>opencode pair --remote</code>) for an HTTPS link, or put the server
          behind Tailscale Serve / a Cloudflare Tunnel and use <code>opencode pair --url https://…</code>.
          {error.url && blockedAsMixedContent(error.url) ? " In Chrome you can also allow local network access when prompted." : ""}
        </p>
      )}
      {error.reason === "unreachable" && (
        <div class="stack">
          <p class="small">
            Is OpenCode running? For LAN addresses the server must listen on all interfaces (
            <code>opencode service set hostname 0.0.0.0</code>) and both devices must be on the same network.
          </p>
          <p class="small">
            If it is running, the browser may be blocking this app's origin. Browsers report that the same way as an
            unreachable server, so allow the origin to rule it out:
          </p>
          <CorsFix origin={origin} serverUrl={error.url} known={known} />
        </div>
      )}
      {error.reason === "unauthorized" && (
        <p class="small">
          The saved pairing expired or the server password changed. Pair this device again (Pair device in the OpenCode
          app, or <code>opencode pair</code>).
        </p>
      )}
      {error.reason === "expired-code" && (
        <p class="small">
          Pairing links work once and expire after 5 minutes. Create a fresh one (Pair device → New code, or{" "}
          <code>opencode pair</code>).
        </p>
      )}
    </div>
  )
}
