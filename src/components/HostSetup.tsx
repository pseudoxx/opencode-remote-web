import { useState } from "preact/hooks"
import { Cmd } from "./ui"
import { prefs, setPref } from "../state/store"
import { guessHostOS, HOST_OS_LABEL, type HostOS } from "../lib/hostos"
import { rich, t, type MessageKey } from "../i18n"

// Where each OpenCode desktop app keeps the CLI it ships with. The app runs the same background service as the
// CLI, so app-only users can run these without installing anything.
const APP_CLI: Record<HostOS, string> = {
  macos: '"/Applications/OpenCode.app/Contents/Resources/opencode-cli"',
  windows: '& "$env:LOCALAPPDATA\\Programs\\@opencodedesktop\\resources\\opencode-cli.exe"',
  linux: "/opt/OpenCode/resources/opencode-cli",
}

const APP_LABEL: Record<HostOS, [MessageKey, MessageKey]> = {
  macos: ["host.appMac", "host.appMacName"],
  windows: ["host.appWindows", "host.appWindowsName"],
  linux: ["host.appLinux", "host.appLinuxName"],
}

// PowerShell would split an unquoted comma list into separate arguments.
const quoteOrigin = (os: HostOS, origin: string) => (os === "windows" ? `"${origin}"` : origin)

function OsPicker({ os, onPick }: { os: HostOS; onPick: (os: HostOS) => void }) {
  return (
    <div class="os-picker" role="radiogroup" aria-label={t("host.picker")}>
      {(Object.keys(HOST_OS_LABEL) as HostOS[]).map((value) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={os === value}
          class={os === value ? "active" : ""}
          onClick={() => onPick(value)}
        >
          {HOST_OS_LABEL[value]}
        </button>
      ))}
    </div>
  )
}

function useHostOS(serverUrl?: string, known?: HostOS) {
  const guess = guessHostOS({ serverUrl, known, lastPick: prefs.value.hostOS })
  const [picked, setPicked] = useState<HostOS>()
  const os = picked ?? guess.os
  const pick = (value: HostOS) => {
    setPicked(value)
    setPref("hostOS", value)
  }
  return { os, pick, reason: picked ? undefined : t(guess.reason, guess.params) }
}

function ServiceCommands({ os, origin }: { os: HostOS; origin: string }) {
  const [label, name] = APP_LABEL[os]
  const appCommands = (
    <div class="stack tight">
      <p class="small">{rich(label, { name: <strong>{t(name)}</strong> })}</p>
      <Cmd text={`${APP_CLI[os]} service set cors ${quoteOrigin(os, origin)}`} />
      <Cmd text={`${APP_CLI[os]} service restart`} />
    </div>
  )
  const cliName = <strong>{t("host.cliName")}</strong>
  const cliCommands = (
    <div class="stack tight">
      <p class="small">
        {os === "macos" ? rich("host.cliMac", { name: cliName, menu: <strong>{t("host.installCliMenu")}</strong> }) : rich("host.cli", { name: cliName })}
      </p>
      <Cmd text={`opencode service set cors ${quoteOrigin(os, origin)}`} />
      <Cmd text="opencode service restart" />
    </div>
  )
  return (
    <>
      {os === "linux" ? cliCommands : appCommands}
      {os === "linux" ? appCommands : cliCommands}
    </>
  )
}

// One-time CORS setup for this page's origin, for the OS that runs OpenCode.
export function CorsFix({ origin, serverUrl, known }: { origin: string; serverUrl?: string; known?: HostOS }) {
  const { os, pick, reason } = useHostOS(serverUrl, known)
  return (
    <div class="stack host-setup">
      <OsPicker os={os} onPick={pick} />
      {reason && <p class="muted tiny">{reason}</p>}
      <ServiceCommands os={os} origin={origin} />
      <p class="muted small">{rich("host.serveNote", { serve: <code>opencode serve</code>, flag: <code>--cors {origin}</code> })}</p>
    </div>
  )
}
