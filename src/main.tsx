import "./polyfills"
import "./styles.css"
import { render } from "preact"
import { App } from "./app"
import { applyTheme } from "./components/Settings"
import { prefs } from "./state/store"
import { t } from "./i18n"
import { APP_NAME } from "./lib/brand"

// Refuse to run inside a frame: a page that can approve shell commands must not be clickjackable.
if (window.top !== window.self) {
  document.body.textContent = t("app.noFraming", { app: APP_NAME })
} else {
  applyTheme(prefs.value.theme)
  render(<App />, document.getElementById("app")!)
  if ("serviceWorker" in navigator && import.meta.env.PROD && window.isSecureContext) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./sw.js").catch(() => {})
    })
  }
}
