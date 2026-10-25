import { useEffect, useRef, useState } from "preact/hooks"
import { Icon } from "./Icon"
import { Cmd, Spinner } from "./ui"
import { CorsFix } from "./HostSetup"
import { LanguageSelect } from "./LanguageSelect"
import { QrScanner, decodeImageFile } from "./QrScanner"
import { ConnectError, authHeader, describeError, detect, exchangePairingCode } from "../lib/connect"
import { blockedAsMixedContent, normalizeServerUrl, parseConnectInput, type ConnectRequest } from "../lib/pairing"
import { newId, type ServerRecord } from "../lib/storage"
import type { HostOS } from "../lib/hostos"
import { dateText, relativeTime } from "../lib/format"
import { APP_NAME } from "../lib/brand"
import { conn, connectServer, failedServer, removeServer, servers, upsertServer } from "../state/store"
import { rich, t, type MessageKey } from "../i18n"

type Tab = "scan" | "link" | "password"

// What the screen shows about a failed attempt: a ConnectError (translated on render) or a message key.
type ScreenError = ConnectError | { reason: "other"; key: MessageKey; url?: string }
type HelpError = { reason: string; text: string; url?: string }

function hostLabel(url: string) {
  try {
    const u = new URL(url)
    return u.port ? `${u.hostname}:${u.port}` : u.hostname
  } catch {
    return url
  }
}

function asHelp(error: ScreenError | unknown): HelpError {
  if (error instanceof ConnectError) return { reason: error.reason, text: error.text, url: error.url }
  const e = error as { reason?: string; key?: MessageKey; url?: string }
  if (e && e.reason === "other" && e.key) return { reason: "other", text: t(e.key), url: e.url }
  return { reason: "other", text: describeError(error) }
}

export function ConnectScreen({ initial, onInitialUsed }: { initial?: string; onInitialUsed?: () => void }) {
  const [tab, setTab] = useState<Tab>(() => (initial ? "link" : "scan"))
  const [link, setLink] = useState(initial ?? "")
  const [url, setUrl] = useState("")
  const [username, setUsername] = useState("opencode")
  const [password, setPassword] = useState("")
  const [remember, setRemember] = useState(true)
  const [scanning, setScanning] = useState(false)
  const [working, setWorking] = useState<MessageKey>()
  const [error, setError] = useState<ScreenError | { reason: "unknown"; error: unknown }>()
  const photo = useRef<HTMLInputElement>(null)

  const failedConn = conn.value.status === "error" || conn.value.status === "unauthorized"
  const other = (key: MessageKey, url?: string) => setError({ reason: "other", key, url })

  async function run(request: ConnectRequest | undefined) {
    if (!request) return other("connect.badInput")
    setError(undefined)
    try {
      let record: ServerRecord
      if (request.type === "pair") {
        setWorking("connect.pairing")
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
        setWorking("connect.checking")
        try {
          await detect(record.url, undefined)
        } catch (e) {
          if (e instanceof ConnectError && e.reason === "unauthorized") {
            setUrl(request.url)
            setTab("password")
            setWorking(undefined)
            return other("connect.needsPassword", request.url)
          }
          throw e
        }
      }
      setWorking("connect.connecting")
      const { kind, version } = await detect(record.url, authHeader(record))
      const saved = upsertServer({ ...record, kind, version })
      setWorking(undefined)
      setLink("")
      setPassword("")
      await connectServer(saved)
    } catch (e) {
      setWorking(undefined)
      setError(e instanceof ConnectError ? e : { reason: "unknown", error: e })
    }
  }

  useEffect(() => {
    if (!initial) return
    onInitialUsed?.()
    setTab("link")
    setLink(initial)
    run(parseConnectInput(initial))
  }, [initial])

  async function pasteFromClipboard() {
    try {
      const text = await navigator.clipboard.readText()
      setLink(text)
      if (text.trim()) run(parseConnectInput(text))
    } catch {
      other("connect.clipboardBlocked")
    }
  }

  async function scanPhoto(file?: File) {
    if (!file) return
    setWorking("connect.readingQr")
    const text = await decodeImageFile(file).catch(() => undefined)
    setWorking(undefined)
    if (!text) return other("connect.noQr")
    run(parseConnectInput(text))
  }

  const origin = location.origin
  const saved = servers.value
  const failed = saved.find((s) => s.id === failedServer.value)
  const shownError = error ? asHelp(error.reason === "unknown" ? (error as { error: unknown }).error : error) : undefined

  return (
    <div class="connect">
      <div class="connect-inner">
        <header class="brand">
          <img src="./icon.svg" alt="" width={44} height={44} />
          <div>
            <h1>{APP_NAME}</h1>
            <p class="muted">{t("app.tagline")}</p>
          </div>
          <LanguageSelect compact />
        </header>

        {saved.length > 0 && (
          <section class="card">
            <h2 class="card-title">{t("connect.yourServers")}</h2>
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
                          {expired ? ` · ${t("connect.expired")}` : s.expires ? ` · ${t("connect.validUntil", { date: dateText(s.expires) })}` : ""}
                          {!s.remember ? ` · ${t("connect.tabOnly")}` : ""}
                        </small>
                      </span>
                      <Icon name="chevronRight" />
                    </button>
                    <button
                      class="icon-btn"
                      aria-label={t("connect.forgetLabel", { name: s.name })}
                      title={t("connect.forget")}
                      onClick={() => {
                        if (confirm(t("connect.forgetConfirm", { name: s.name }))) removeServer(s.id)
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
                error={{
                  reason: conn.value.status === "unauthorized" ? "unauthorized" : (conn.value.reason ?? "other"),
                  text: conn.value.error,
                  url: failed?.url,
                }}
                origin={origin}
                known={failed?.os}
              />
            )}
          </section>
        )}

        <section class="card">
          <h2 class="card-title">{saved.length ? t("connect.addServer") : t("connect.title")}</h2>
          <div class="tabs" role="tablist">
            {(
              [
                ["scan", "connect.tab.scan", "qr"],
                ["link", "connect.tab.link", "link"],
                ["password", "connect.tab.password", "shield"],
              ] as const
            ).map(([id, label, icon]) => (
              <button key={id} role="tab" aria-selected={tab === id} class={tab === id ? "active" : ""} onClick={() => setTab(id)}>
                <Icon name={icon} size={16} /> {t(label)}
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
                    <Icon name="camera" /> {t("connect.scan")}
                  </button>
                  <button class="btn" onClick={() => photo.current?.click()} disabled={!!working}>
                    <Icon name="image" /> {t("connect.fromPhoto")}
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
                {rich("connect.scanHint", { pairDevice: <strong>Pair device</strong>, command: <code>opencode pair --remote</code> })}
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
                <span>{t("connect.linkLabel")}</span>
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
                    <Icon name="clipboard" /> {t("connect.paste")}
                  </button>
                )}
                <button type="submit" class="btn primary grow" disabled={!!working || !link.trim()}>
                  {t("connect.connect")}
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
                if (!base) return other("connect.enterAddress")
                run({ type: "password", url: base, username, password })
              }}
            >
              <label class="field">
                <span>{t("connect.serverAddress")}</span>
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
                  <span>{t("connect.username")}</span>
                  <input value={username} onInput={(e) => setUsername(e.currentTarget.value)} autoCapitalize="off" autoCorrect="off" />
                </label>
                <label class="field grow">
                  <span>{t("connect.password")}</span>
                  <input type="password" value={password} onInput={(e) => setPassword(e.currentTarget.value)} autoComplete="current-password" />
                </label>
              </div>
              <button type="submit" class="btn primary" disabled={!!working}>
                {t("connect.connect")}
              </button>
              <p class="muted small">{rich("connect.passwordHint", { serve: <code>opencode serve</code>, env: <code>OPENCODE_SERVER_PASSWORD</code> })}</p>
            </form>
          )}

          <label class="check">
            <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.currentTarget.checked)} />
            <span>{t("connect.remember")}</span>
          </label>

          {working && (
            <p class="note">
              <Spinner /> {t(working)}
            </p>
          )}
          {shownError && <ErrorHelp error={shownError} origin={origin} />}
        </section>

        <details class="card guide">
          <summary>
            <Icon name="sparkle" /> {t("guide.title")}
          </summary>
          <ol>
            <li>
              <p>{rich("guide.allow", { origin: <code>{origin}</code> })}</p>
              <CorsFix origin={origin} />
            </li>
            <li>
              <p>{t("guide.pair")}</p>
              <p class="small">
                {rich("guide.pairApp", {
                  pairing: <strong>Pairing</strong>,
                  pairDevice: <strong>Pair device</strong>,
                  remoteAccess: <strong>Remote access</strong>,
                  copyLink: <strong>Copy link</strong>,
                })}
              </p>
              <Cmd text="opencode pair --remote" />
              <p class="muted small">
                {rich("guide.pairNote", { pair: <code>opencode pair</code>, pairUrl: <code>opencode pair --url https://your-address</code> })}
              </p>
            </li>
          </ol>
          <p class="muted small">
            <Icon name="shield" size={14} /> {t("guide.privacy")}
          </p>
        </details>
      </div>
    </div>
  )
}

function ErrorHelp({ error, origin, known }: { error: HelpError; origin: string; known?: HostOS }) {
  return (
    <div class="note error stack">
      <p>
        <Icon name="alert" /> {error.text}
      </p>
      {error.reason === "cors" && (
        <div class="stack">
          <p>{t("help.corsIntro")}</p>
          <CorsFix origin={origin} serverUrl={error.url} known={known} />
        </div>
      )}
      {error.reason === "mixed-content" && (
        <p class="small">
          {rich("help.mixed", { remote: <code>opencode pair --remote</code>, pairUrl: <code>opencode pair --url https://…</code> })}
          {error.url && blockedAsMixedContent(error.url) ? ` ${t("help.mixedChrome")}` : ""}
        </p>
      )}
      {error.reason === "unreachable" && (
        <div class="stack">
          <p class="small">{rich("help.unreachable", { hostname: <code>opencode service set hostname 0.0.0.0</code> })}</p>
          <p class="small">{t("help.unreachableCors")}</p>
          <CorsFix origin={origin} serverUrl={error.url} known={known} />
        </div>
      )}
      {error.reason === "unauthorized" && <p class="small">{rich("help.unauthorized", { pair: <code>opencode pair</code> })}</p>}
      {error.reason === "expired-code" && <p class="small">{rich("help.expiredCode", { pair: <code>opencode pair</code> })}</p>}
    </div>
  )
}
