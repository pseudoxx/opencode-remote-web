import { useEffect, useState } from "preact/hooks"
import { Icon } from "./Icon"
import { Menu, Spinner, TextPrompt } from "./ui"
import { Sidebar } from "./Sidebar"
import { ChatView, PendingCards } from "./Chat"
import { Composer } from "./Composer"
import { ConnectionDialog, StatusPill, statusTone } from "./Connection"
import { Settings } from "./Settings"
import { copySession, exportSession } from "./exporting"
import { ChangesSheet } from "./Changes"
import {
  changesView,
  compactSession,
  conn,
  currentSession,
  currentSessionID,
  deleteSession,
  directory,
  disconnect,
  forkSession,
  projectLabel,
  renameSession,
  retryConnection,
  selectedModel,
  showSessionChanges,
} from "../state/store"
import { canShareFiles } from "../lib/export"
import { compactNumber, money } from "../lib/format"

export function Workspace() {
  const [drawer, setDrawer] = useState(false)
  const [connOpen, setConnOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const session = currentSession.value
  const sid = currentSessionID.value
  const c = conn.value

  useEffect(() => {
    if (!drawer) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDrawer(false)
    }
    window.addEventListener("keydown", onKey)
    // Android's back gesture closes the drawer instead of leaving the app (CloseWatcher, Chrome 126+).
    const Watcher = (window as { CloseWatcher?: new () => { onclose: (() => void) | null; destroy(): void } }).CloseWatcher
    let watcher: { onclose: (() => void) | null; destroy(): void } | undefined
    try {
      watcher = Watcher ? new Watcher() : undefined
      if (watcher) watcher.onclose = () => setDrawer(false)
    } catch {}
    return () => {
      window.removeEventListener("keydown", onKey)
      watcher?.destroy()
    }
  }, [drawer])

  const model = selectedModel.value
  const share = canShareFiles()

  return (
    <div class={`workspace${drawer ? " drawer-open" : ""}`}>
      <Sidebar onNavigate={() => setDrawer(false)} onConnection={() => setConnOpen(true)} onSettings={() => setSettingsOpen(true)} />
      <div class="scrim" onClick={() => setDrawer(false)} aria-hidden="true" />
      <main class="main">
        <header class="topbar">
          <button class="icon-btn only-mobile" aria-label="Open sessions" onClick={() => setDrawer(true)}>
            <Icon name="menu" />
          </button>
          <div class="topbar-title">
            <button class="title-btn ellipsis" onClick={() => sid && setRenaming(true)} disabled={!sid} title={sid ? "Rename" : undefined}>
              {session?.title || (sid ? "Untitled session" : "New session")}
            </button>
            <small class="muted ellipsis">
              {projectLabel(directory.value)}
              {model ? ` · ${model.id}${model.variant && model.variant !== "default" ? ` (${model.variant})` : ""}` : ""}
              {session && session.tokens.input + session.tokens.output > 0
                ? ` · ${compactNumber(session.tokens.input + session.tokens.output)} tokens${session.cost ? ` · ${money(session.cost)}` : ""}`
                : ""}
            </small>
          </div>
          <span class="only-mobile">
            <StatusPill compact onClick={() => setConnOpen(true)} />
          </span>
          <button class="icon-btn" aria-label="Session menu" onClick={() => setMenuOpen(true)} disabled={!sid}>
            <Icon name="more" />
          </button>
        </header>
        {c.status !== "live" && c.status !== "idle" && (
          <div class={`conn-banner ${statusTone(c.status)}`}>
            {c.status === "connecting" || c.status === "reconnecting" ? <Spinner size={12} /> : <Icon name="alert" size={14} />}
            <span class="grow">
              {c.status === "connecting"
                ? "Connecting…"
                : c.status === "reconnecting"
                  ? `Reconnecting${c.attempt ? ` (attempt ${c.attempt})` : ""}…`
                  : c.status === "offline"
                    ? "You're offline. Waiting for the network…"
                    : (c.error ?? "Connection problem")}
            </span>
            {c.status === "unauthorized" ? (
              <button class="btn small" onClick={() => disconnect()}>
                Pair again
              </button>
            ) : (
              <button class="btn small" onClick={() => retryConnection()}>
                Retry
              </button>
            )}
          </div>
        )}
        <ChatView />
        <PendingCards />
        <Composer />
      </main>
      <ConnectionDialog open={connOpen} onClose={() => setConnOpen(false)} onRepair={() => disconnect()} />
      <Settings open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <ChangesSheet target={changesView.value} onClose={() => (changesView.value = undefined)} />
      <Menu
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        title={session?.title || "Session"}
        items={
          sid
            ? [
                { label: "View changes", icon: "file", onSelect: () => showSessionChanges(sid) },
                { label: "Copy conversation (Markdown)", icon: "copy", onSelect: () => copySession(sid) },
                { label: "Download Markdown", icon: "download", onSelect: () => exportSession(sid, "md") },
                { label: "Download JSON", icon: "download", onSelect: () => exportSession(sid, "json") },
                share && { label: "Share…", icon: "share", onSelect: () => exportSession(sid, "md", "share") },
                { label: "Rename", icon: "edit", onSelect: () => setRenaming(true) },
                { label: "Fork session", icon: "fork", onSelect: () => forkSession(sid) },
                { label: "Compact context", icon: "refresh", onSelect: () => compactSession(sid) },
                {
                  label: "Delete session",
                  icon: "trash",
                  danger: true,
                  onSelect: () => confirm("Delete this session? This cannot be undone.") && deleteSession(sid),
                },
              ]
            : []
        }
      />
      <TextPrompt
        open={renaming}
        title="Rename session"
        label="Title"
        initial={session?.title ?? ""}
        onClose={() => setRenaming(false)}
        onSubmit={(title) => sid && renameSession(sid, title)}
      />
    </div>
  )
}
