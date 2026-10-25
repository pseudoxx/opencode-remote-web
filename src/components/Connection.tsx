import { useEffect, useState } from "preact/hooks"
import { Icon } from "./Icon"
import { Sheet, Spinner } from "./ui"
import { activeServer, backend, conn, disconnect, lastActivity, measureLatency, retryConnection } from "../state/store"
import { describeError } from "../lib/connect"
import { HOST_OS_LABEL } from "../lib/hostos"
import { dateTimeText } from "../lib/format"
import { t, type MessageKey } from "../i18n"

const labelKeys: Record<string, MessageKey> = {
  idle: "conn.idle",
  connecting: "conn.connecting",
  live: "conn.live",
  reconnecting: "conn.reconnecting",
  offline: "conn.offline",
  unauthorized: "conn.unauthorized",
  error: "conn.error",
}
const statusLabel = (status: string) => t(labelKeys[status] ?? "conn.error")

export function statusTone(status: string) {
  if (status === "live") return "ok"
  if (status === "connecting" || status === "reconnecting") return "warn"
  return "bad"
}

export function StatusPill({ onClick, compact }: { onClick: () => void; compact?: boolean }) {
  const c = conn.value
  const label = c.status === "live" && c.latency !== undefined ? t("conn.liveLatency", { ms: c.latency }) : statusLabel(c.status)
  return (
    <button class={`pill ${statusTone(c.status)}`} onClick={onClick} title={t("conn.details")} aria-label={t("conn.pill", { status: label })}>
      <span class="dot" />
      {!compact && <span>{label}</span>}
    </button>
  )
}

function useNow(ms = 1000) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms)
    return () => clearInterval(t)
  }, [ms])
  return now
}

type TestResult = { ok: boolean; samples: number[]; error?: string; version?: string }

export function ConnectionDialog({ open, onClose, onRepair }: { open: boolean; onClose: () => void; onRepair: () => void }) {
  const now = useNow()
  const [testing, setTesting] = useState(false)
  const [result, setResult] = useState<TestResult>()
  const server = activeServer.value
  const b = backend.value
  const c = conn.value

  useEffect(() => {
    if (!open) setResult(undefined)
  }, [open])

  async function runTest() {
    if (!b) return
    setTesting(true)
    const samples: number[] = []
    let version: string | undefined
    try {
      for (let i = 0; i < 5; i++) {
        const started = performance.now()
        const info = await b.info(AbortSignal.timeout(10_000))
        samples.push(Math.round(performance.now() - started))
        version = info.version
      }
      setResult({ ok: true, samples, version })
      measureLatency(b)
    } catch (error) {
      setResult({ ok: false, samples, error: describeError(error) })
    } finally {
      setTesting(false)
    }
  }

  const heartbeatAge = lastActivity.value ? Math.max(0, Math.round((now - lastActivity.value) / 1000)) : undefined
  const expires = server?.expires

  return (
    <Sheet open={open} onClose={onClose} title={t("conn.title")}>
      <div class="stack">
        <div class={`status-banner ${statusTone(c.status)}`}>
          <span class="dot" />
          <strong>{statusLabel(c.status)}</strong>
          {c.attempt ? <span class="muted"> · {t("conn.attempt", { n: c.attempt })}</span> : null}
        </div>
        {c.error && <p class="note error small">{c.error}</p>}
        <dl class="facts">
          <dt>{t("conn.server")}</dt>
          <dd class="mono break">{server?.url}</dd>
          <dt>{t("conn.opencode")}</dt>
          <dd>{b ? `v${b.version} (${b.kind === "v2" ? t("conn.apiV2") : t("conn.apiV1")})` : (server?.version ?? "—")}</dd>
          {server?.os && (
            <>
              <dt>{t("conn.computer")}</dt>
              <dd>{HOST_OS_LABEL[server.os]}</dd>
            </>
          )}
          <dt>{t("conn.signedIn")}</dt>
          <dd>
            {server?.username} · {server?.auth === "token" ? t("conn.pairedDevice") : t("conn.passwordAuth")}
          </dd>
          {expires && (
            <>
              <dt>{t("conn.validUntil")}</dt>
              <dd>{dateTimeText(expires)}</dd>
            </>
          )}
          <dt>{t("conn.heartbeat")}</dt>
          <dd>{heartbeatAge === undefined ? "—" : heartbeatAge < 2 ? t("conn.justNow") : t("conn.secondsAgo", { n: heartbeatAge })}</dd>
          <dt>{t("conn.latency")}</dt>
          <dd>{c.latency !== undefined ? `${c.latency} ms` : "—"}</dd>
        </dl>
        {result && (
          <div class={`note ${result.ok ? "success" : "error"} small`}>
            {result.ok ? (
              <>
                <Icon name="check" size={14} />{" "}
                {t("conn.testOk", {
                  min: Math.min(...result.samples),
                  avg: Math.round(result.samples.reduce((a, b) => a + b, 0) / result.samples.length),
                  max: Math.max(...result.samples),
                })}
              </>
            ) : (
              <>
                <Icon name="alert" size={14} /> {t("conn.testFailed", { n: result.samples.length + 1, error: result.error ?? "" })}
              </>
            )}
          </div>
        )}
        <div class="row wrap">
          <button class="btn primary" onClick={runTest} disabled={testing || !b}>
            {testing ? <Spinner /> : <Icon name="activity" />} {t("conn.test")}
          </button>
          <button class="btn" onClick={() => retryConnection()}>
            <Icon name="refresh" /> {t("conn.reconnect")}
          </button>
          {c.status === "unauthorized" && (
            <button class="btn" onClick={onRepair}>
              <Icon name="qr" /> {t("conn.pairAgain")}
            </button>
          )}
          <button
            class="btn ghost"
            onClick={() => {
              onClose()
              disconnect()
            }}
          >
            <Icon name="logout" /> {t("conn.switch")}
          </button>
        </div>
      </div>
    </Sheet>
  )
}
