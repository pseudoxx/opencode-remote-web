import { Sheet } from "./ui"
import { Icon } from "./Icon"
import { LanguageSelect } from "./LanguageSelect"
import { prefs, servers, setPref, toast } from "../state/store"
import { removeServer } from "../state/store"
import { t, type MessageKey } from "../i18n"
import { APP_NAME } from "../lib/brand"

export type Theme = "system" | "light" | "dark"

export function applyTheme(theme: Theme | undefined) {
  const root = document.documentElement
  if (!theme || theme === "system") delete root.dataset.theme
  else root.dataset.theme = theme
}

const themeLabels: Record<Theme, MessageKey> = {
  system: "settings.themeSystem",
  light: "settings.themeLight",
  dark: "settings.themeDark",
}

export function Settings({ open, onClose }: { open: boolean; onClose: () => void }) {
  const p = prefs.value
  const theme = (p.theme ?? "system") as Theme
  const canNotify = typeof Notification !== "undefined"

  return (
    <Sheet open={open} onClose={onClose} title={t("settings.title")}>
      <div class="stack">
        <LanguageSelect />

        <fieldset class="segmented">
          <legend>{t("settings.theme")}</legend>
          {(["system", "light", "dark"] as const).map((value) => (
            <label key={value} class={theme === value ? "active" : ""}>
              <input
                type="radio"
                name="theme"
                checked={theme === value}
                onChange={() => {
                  setPref("theme", value)
                  applyTheme(value)
                }}
              />
              {t(themeLabels[value])}
            </label>
          ))}
        </fieldset>

        <fieldset class="segmented">
          <legend>{t("settings.enter")}</legend>
          {(
            [
              ["auto", undefined, "settings.enterAuto"],
              ["send", true, "settings.enterSends"],
              ["newline", false, "settings.enterNewline"],
            ] as const
          ).map(([id, value, label]) => (
            <label key={id} class={p.enterToSend === value ? "active" : ""}>
              <input type="radio" name="enter" checked={p.enterToSend === value} onChange={() => setPref("enterToSend", value)} />
              {t(label)}
            </label>
          ))}
        </fieldset>
        <p class="muted small">{t("settings.enterNote")}</p>

        <label class="check">
          <input type="checkbox" checked={!!p.showReasoning} onChange={(e) => setPref("showReasoning", e.currentTarget.checked)} />
          <span>{t("settings.reasoning")}</span>
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
                    toast(t("settings.notifyBlocked"), "error")
                    setPref("notify", false)
                    return
                  }
                }
                setPref("notify", on)
              }}
            />
            <span>{t("settings.notify")}</span>
          </label>
        )}

        <div class="card inset">
          <h3 class="card-title">
            <Icon name="shield" size={16} /> {t("settings.privacy")}
          </h3>
          <p class="small muted">
            {t("settings.privacyText", {
              app: APP_NAME,
              remembered: servers.value.filter((s) => s.remember).length,
              temporary: servers.value.filter((s) => !s.remember).length,
            })}
          </p>
          <button
            class="btn danger small"
            disabled={!servers.value.length}
            onClick={() => {
              if (!confirm(t("settings.forgetAllConfirm"))) return
              for (const s of servers.value) removeServer(s.id)
              onClose()
            }}
          >
            {t("settings.forgetAll")}
          </button>
        </div>
        <p class="muted tiny">{t("settings.version", { app: APP_NAME, version: __APP_VERSION__ })}</p>
      </div>
    </Sheet>
  )
}
