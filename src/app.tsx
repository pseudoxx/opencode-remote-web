import { useEffect, useState } from "preact/hooks"
import { ConnectScreen } from "./components/ConnectScreen"
import { Workspace } from "./components/Workspace"
import { Toasts } from "./components/ui"
import { activeServer, connectServer, prefs, servers } from "./state/store"

// A pairing payload can arrive in the URL fragment (https://app/#pair=<link or QR json>). The fragment never
// reaches the web host, and is removed from the address bar right away so it does not linger in history.
function takePairFragment() {
  const params = new URLSearchParams(location.hash.slice(1))
  const pair = params.get("pair")
  if (pair) history.replaceState(null, "", location.pathname + location.search)
  return pair ?? undefined
}

export function App() {
  const [initial, setInitial] = useState(takePairFragment)

  useEffect(() => {
    if (initial) return
    const last = servers.value.find((s) => s.id === prefs.value.lastServer)
    if (last && !activeServer.value) connectServer(last)
  }, [])

  return (
    <>
      {activeServer.value ? <Workspace /> : <ConnectScreen initial={initial} onInitialUsed={() => setInitial(undefined)} />}
      <Toasts />
    </>
  )
}
