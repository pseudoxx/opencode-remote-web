import { useEffect, useState } from "preact/hooks"
import { Icon } from "./Icon"
import { Sheet, Spinner } from "./ui"
import { activeServer, backend, conn, disconnect, lastActivity, measureLatency, retryConnection } from "../state/store"
import { describeError } from "../lib/connect"

const labels: Record<string, string> = {
  idle: "Disconnected",
  connecting: "Connecting…",
  live: "Live",
  reconnecting: "Reconnecting…",
  offline: "Offline",
  unauthorized: "Not authorized",
  error: "Error",
}

export function statusTone(status: string) {
  if (status === "live") return "ok"
  if (status === "connecting" || status === "reconnecting") return "warn"
  return "bad"
}

export function StatusPill({ onClick, compact }: { onClick: () => void; compact?: boolean }) {
  const c = conn.value
  const label = c.status === "live" && c.latency !== undefined ? `Live · ${c.latency} ms` : labels[c.status]
  return (
    <button class={`pill ${statusTone(c.status)}`} onClick={onClick} title="Connection details" aria-label={`Connection: ${label}`}>
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
        const t = performance.now()
        const info = await b.info(AbortSignal.timeout(10_000))
        samples.push(Math.round(performance.now() - t))
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
    <Sheet open={open} onClose={onClose} title="Connection">
      <div class="stack">
        <div class={`status-banner ${statusTone(c.status)}`}>
          <span class="dot" />
          <strong>{labels[c.status]}</strong>
          {c.attempt ? <span class="muted"> · attempt {c.attempt}</span> : null}
        </div>
        {c.error && <p class="note error small">{c.error}</p>}
        <dl class="facts">
          <dt>Server</dt>
          <dd class="mono break">{server?.url}</dd>
          <dt>OpenCode</dt>
          <dd>{b ? `v${b.version} (${b.kind === "v2" ? "v2 API" : "1.x API"})` : (server?.version ?? "—")}</dd>
          <dt>Signed in as</dt>
          <dd>
            {server?.username} · {server?.auth === "token" ? "paired device" : "password"}
          </dd>
          {expires && (
            <>
              <dt>Pairing valid until</dt>
              <dd>{new Date(expires).toLocaleString()}</dd>
            </>
          )}
          <dt>Last heartbeat</dt>
          <dd>{heartbeatAge === undefined ? "—" : heartbeatAge < 2 ? "just now" : `${heartbeatAge}s ago`}</dd>
          <dt>Latency</dt>
          <dd>{c.latency !== undefined ? `${c.latency} ms` : "—"}</dd>
        </dl>
        {result && (
          <div class={`note ${result.ok ? "success" : "error"} small`}>
            {result.ok ? (
              <>
                <Icon name="check" size={14} /> 5/5 requests OK · min {Math.min(...result.samples)} ms · avg{" "}
                {Math.round(result.samples.reduce((a, b) => a + b, 0) / result.samples.length)} ms · max {Math.max(...result.samples)} ms
              </>
            ) : (
              <>
                <Icon name="alert" size={14} /> Failed after {result.samples.length} requests: {result.error}
              </>
            )}
          </div>
        )}
        <div class="row wrap">
          <button class="btn primary" onClick={runTest} disabled={testing || !b}>
            {testing ? <Spinner /> : <Icon name="activity" />} Test connection
          </button>
          <button class="btn" onClick={() => retryConnection()}>
            <Icon name="refresh" /> Reconnect
          </button>
          {c.status === "unauthorized" && (
            <button class="btn" onClick={onRepair}>
              <Icon name="qr" /> Pair again
            </button>
          )}
          <button
            class="btn ghost"
            onClick={() => {
              onClose()
              disconnect()
            }}
          >
            <Icon name="logout" /> Switch server
          </button>
        </div>
      </div>
    </Sheet>
  )
}
