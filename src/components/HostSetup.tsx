import { useState } from "preact/hooks"
import { Cmd } from "./ui"
import { prefs, setPref } from "../state/store"
import { guessHostOS, HOST_OS_LABEL, type HostOS } from "../lib/hostos"

// Where each OpenCode desktop app keeps the CLI it ships with. The app runs the same background service as the
// CLI, so app-only users can run these without installing anything.
const APP_CLI: Record<HostOS, string> = {
  macos: '"/Applications/OpenCode.app/Contents/Resources/opencode-cli"',
  windows: '& "$env:LOCALAPPDATA\\Programs\\@opencodedesktop\\resources\\opencode-cli.exe"',
  linux: "/opt/OpenCode/resources/opencode-cli",
}

// PowerShell would split an unquoted comma list into separate arguments.
const quoteOrigin = (os: HostOS, origin: string) => (os === "windows" ? `"${origin}"` : origin)

function OsPicker({ os, onPick }: { os: HostOS; onPick: (os: HostOS) => void }) {
  return (
    <div class="os-picker" role="radiogroup" aria-label="Computer running OpenCode">
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
  return { os, pick, reason: picked ? undefined : guess.reason }
}

function ServiceCommands({ os, origin }: { os: HostOS; origin: string }) {
  const appCommands = (
    <div class="stack tight">
      <p class="small">
        {os === "macos" && (
          <>
            <strong>OpenCode Mac app</strong> (no CLI needed), in Terminal:
          </>
        )}
        {os === "windows" && (
          <>
            <strong>OpenCode Windows app</strong> (no CLI needed), in PowerShell:
          </>
        )}
        {os === "linux" && (
          <>
            <strong>OpenCode desktop app</strong> (.deb / .rpm; for the AppImage use the CLI):
          </>
        )}
      </p>
      <Cmd text={`${APP_CLI[os]} service set cors ${quoteOrigin(os, origin)}`} />
      <Cmd text={`${APP_CLI[os]} service restart`} />
    </div>
  )
  const cliCommands = (
    <div class="stack tight">
      <p class="small">
        <strong>opencode CLI</strong>
        {os === "macos" ? " (or after OpenCode → Install CLI… in the app menu)" : ""}:
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
      <p class="muted small">
        Running <code>opencode serve</code> yourself instead? Add <code>--cors {origin}</code>. Already allowing other
        origins? List them all, separated by commas. Restarting the service stops running agents, so do it while nothing is
        working.
      </p>
    </div>
  )
}
