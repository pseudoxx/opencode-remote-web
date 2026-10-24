import { Sheet } from "./ui"
import { Icon } from "./Icon"
import { prefs, servers, setPref, toast } from "../state/store"
import { removeServer } from "../state/store"

export type Theme = "system" | "light" | "dark"

export function applyTheme(theme: Theme | undefined) {
  const root = document.documentElement
  if (!theme || theme === "system") delete root.dataset.theme
  else root.dataset.theme = theme
}

export function Settings({ open, onClose }: { open: boolean; onClose: () => void }) {
  const p = prefs.value
  const theme = (p.theme ?? "system") as Theme
  const canNotify = typeof Notification !== "undefined"

  return (
    <Sheet open={open} onClose={onClose} title="Settings">
      <div class="stack">
        <fieldset class="segmented">
          <legend>Theme</legend>
          {(["system", "light", "dark"] as const).map((t) => (
            <label key={t} class={theme === t ? "active" : ""}>
              <input
                type="radio"
                name="theme"
                checked={theme === t}
                onChange={() => {
                  setPref("theme", t)
                  applyTheme(t)
                }}
              />
              {t[0].toUpperCase() + t.slice(1)}
            </label>
          ))}
        </fieldset>

        <fieldset class="segmented">
          <legend>Enter key</legend>
          {(
            [
              [undefined, "Auto"],
              [true, "Sends"],
              [false, "New line"],
            ] as const
          ).map(([value, label]) => (
            <label key={label} class={p.enterToSend === value ? "active" : ""}>
              <input type="radio" name="enter" checked={p.enterToSend === value} onChange={() => setPref("enterToSend", value)} />
              {label}
            </label>
          ))}
        </fieldset>
        <p class="muted small">Auto: Enter sends on computers, inserts a new line on touch screens. Ctrl/⌘+Enter always sends.</p>

        <label class="check">
          <input type="checkbox" checked={!!p.showReasoning} onChange={(e) => setPref("showReasoning", e.currentTarget.checked)} />
          <span>Expand the model's thinking by default</span>
        </label>

        {canNotify && (
          <label class="check">
            <input
              type="checkbox"
              checked={!!p.notify && Notification.permission === "granted"}
              onChange={async (e) => {
                const on = e.currentTarget.checked
                if (on && Notification.permission !== "granted") {
                  const result = await Notification.requestPermission().catch(() => "denied" as NotificationPermission)
                  if (result !== "granted") {
                    toast("Notifications are blocked for this site", "error")
                    setPref("notify", false)
                    return
                  }
                }
                setPref("notify", on)
              }}
            />
            <span>Notify me when a session finishes or needs input (while this tab is in the background)</span>
          </label>
        )}

        <div class="card inset">
          <h3 class="card-title">
            <Icon name="shield" size={16} /> Privacy
          </h3>
          <p class="small muted">
            OC Remote is a static page with no backend. Server addresses and pairing tokens are kept in this browser's
            storage ({servers.value.filter((s) => s.remember).length} remembered, {servers.value.filter((s) => !s.remember).length} for this tab only)
            and are sent only to your own OpenCode server.
          </p>
          <button
            class="btn danger small"
            disabled={!servers.value.length}
            onClick={() => {
              if (!confirm("Forget all saved servers and credentials on this device?")) return
              for (const s of servers.value) removeServer(s.id)
              onClose()
            }}
          >
            Forget all servers
          </button>
        </div>
        <p class="muted tiny">
          OC Remote v{__APP_VERSION__}. Not affiliated with the OpenCode project.
        </p>
      </div>
    </Sheet>
  )
}
