import { useEffect, useRef, useState } from "preact/hooks"
import { Icon } from "./Icon"
import { Menu, Sheet, Spinner, TextPrompt } from "./ui"
import { StatusPill } from "./Connection"
import {
  activeServer,
  backend,
  busy,
  currentSessionID,
  deleteSession,
  directory,
  fail,
  forkSession,
  forms,
  home,
  loadSessions,
  newSession,
  openSession,
  permissions,
  projectLabel,
  projects,
  renameSession,
  sessionList,
  sessionSearch,
  sessionsLoading,
  setDirectory,
} from "../state/store"
import { dirname, relativeTime, shortPath } from "../lib/format"
import type { DirEntry, Session } from "../lib/types"
import { exportSession } from "./exporting"
import { t } from "../i18n"

export function Sidebar(props: { onNavigate: () => void; onConnection: () => void; onSettings: () => void }) {
  const [projectsOpen, setProjectsOpen] = useState(false)
  const [browseOpen, setBrowseOpen] = useState(false)
  const [menuFor, setMenuFor] = useState<Session>()
  const [renaming, setRenaming] = useState<Session>()
  const searchTimer = useRef<ReturnType<typeof setTimeout>>()
  const server = activeServer.value
  const needs = new Set([...permissions.value.map((p) => p.sessionID), ...forms.value.map((f) => f.sessionID)])

  return (
    <aside class="sidebar">
      <div class="side-top">
        <button class="server-chip" onClick={props.onConnection} title={t("conn.details")}>
          <Icon name="server" size={16} />
          <span class="ellipsis">{server?.name}</span>
        </button>
        <StatusPill onClick={props.onConnection} />
      </div>

      <button class="project-chip" onClick={() => setProjectsOpen(true)}>
        <Icon name="folder" size={16} />
        <span class="project-text">
          <strong class="ellipsis">{projectLabel(directory.value)}</strong>
          <small class="muted ellipsis">{directory.value ? shortPath(directory.value, home.value) : t("side.chooseProject")}</small>
        </span>
        <Icon name="chevronDown" size={16} />
      </button>

      <button
        class="btn primary new-session"
        onClick={() => {
          newSession()
          props.onNavigate()
        }}
        disabled={!directory.value}
      >
        <Icon name="plus" /> {t("side.newSession")}
      </button>

      <label class="search">
        <Icon name="search" size={16} />
        <input
          type="search"
          placeholder={t("side.search")}
          value={sessionSearch.value}
          onInput={(e) => {
            sessionSearch.value = e.currentTarget.value
            clearTimeout(searchTimer.current)
            searchTimer.current = setTimeout(() => loadSessions(), 300)
          }}
        />
      </label>

      <nav class="session-list" aria-label={t("side.sessions")}>
        {sessionsLoading.value && !sessionList.value.length && (
          <div class="empty small">
            <Spinner /> {t("common.loading")}
          </div>
        )}
        {!sessionsLoading.value && !sessionList.value.length && (
          <div class="empty small muted">{sessionSearch.value ? t("side.noMatches") : t("side.empty")}</div>
        )}
        <ul>
          {sessionList.value.map((s) => (
            <li key={s.id} class={s.id === currentSessionID.value ? "active" : ""} data-id={s.id}>
              <button
                class="session-item"
                onClick={() => {
                  openSession(s.id)
                  props.onNavigate()
                }}
              >
                <span class="session-title ellipsis">{s.title || t("common.untitled")}</span>
                <span class="session-meta">
                  {needs.has(s.id) ? (
                    <span class="badge warn" title={t("side.needsInput")}>
                      !
                    </span>
                  ) : busy.value[s.id] ? (
                    <Spinner size={12} />
                  ) : null}
                  <small class="muted">{relativeTime(s.updated)}</small>
                </span>
              </button>
              <button class="icon-btn small" aria-label={t("side.actionsFor", { title: s.title || t("common.untitled") })} onClick={() => setMenuFor(s)}>
                <Icon name="more" size={16} />
              </button>
            </li>
          ))}
        </ul>
      </nav>

      <div class="side-foot">
        <button class="btn ghost small" onClick={props.onSettings}>
          <Icon name="settings" size={16} /> {t("side.settings")}
        </button>
        <span class="muted tiny">v{__APP_VERSION__}</span>
      </div>

      <ProjectPicker
        open={projectsOpen}
        onClose={() => setProjectsOpen(false)}
        onBrowse={() => {
          setProjectsOpen(false)
          setBrowseOpen(true)
        }}
        onPicked={props.onNavigate}
      />
      <DirectoryBrowser open={browseOpen} onClose={() => setBrowseOpen(false)} onPicked={props.onNavigate} />
      <Menu
        open={!!menuFor}
        onClose={() => setMenuFor(undefined)}
        title={menuFor?.title || t("common.untitled")}
        items={
          menuFor
            ? [
                { label: t("side.rename"), icon: "edit", onSelect: () => setRenaming(menuFor) },
                { label: t("side.fork"), icon: "fork", onSelect: () => forkSession(menuFor.id).then(props.onNavigate) },
                { label: t("side.exportMd"), icon: "download", onSelect: () => exportSession(menuFor.id, "md") },
                { label: t("side.exportJson"), icon: "download", onSelect: () => exportSession(menuFor.id, "json") },
                {
                  label: t("side.delete"),
                  icon: "trash",
                  danger: true,
                  onSelect: () => {
                    if (confirm(t("side.deleteConfirm", { title: menuFor.title || t("common.untitled") }))) deleteSession(menuFor.id)
                  },
                },
              ]
            : []
        }
      />
      <TextPrompt
        open={!!renaming}
        title={t("rename.title")}
        label={t("rename.label")}
        initial={renaming?.title ?? ""}
        onClose={() => setRenaming(undefined)}
        onSubmit={(title) => renaming && renameSession(renaming.id, title)}
      />
    </aside>
  )
}

function ProjectPicker(props: { open: boolean; onClose: () => void; onBrowse: () => void; onPicked: () => void }) {
  return (
    <Sheet open={props.open} onClose={props.onClose} title={t("projects.title")}>
      <ul class="pick-list">
        {projects.value.map((p) => (
          <li key={p.id + p.directory}>
            <button
              class={p.directory === directory.value ? "active" : ""}
              onClick={() => {
                props.onClose()
                setDirectory(p.directory)
                props.onPicked()
              }}
            >
              <Icon name="folder" />
              <span class="project-text">
                <strong class="ellipsis">{p.name}</strong>
                <small class="muted ellipsis">{shortPath(p.directory, home.value)}</small>
              </span>
              {p.directory === directory.value && <Icon name="check" />}
            </button>
          </li>
        ))}
        {!projects.value.length && <li class="empty small muted">{t("projects.empty")}</li>}
      </ul>
      <button class="btn" onClick={props.onBrowse}>
        <Icon name="folder" /> {t("projects.openOther")}
      </button>
    </Sheet>
  )
}

function DirectoryBrowser(props: { open: boolean; onClose: () => void; onPicked: () => void }) {
  const [path, setPath] = useState("")
  const [entries, setEntries] = useState<DirEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string>()

  async function load(dir: string) {
    const b = backend.value
    if (!b || !dir) return
    setPath(dir)
    setLoading(true)
    setError(undefined)
    try {
      const list = await b.listDirectory(dir)
      setEntries(list.filter((e) => e.type === "directory" && !e.name.startsWith(".")))
    } catch (e) {
      setEntries([])
      setError(t("browse.error"))
      void e
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (props.open) load(directory.value ? dirname(directory.value) : (home.value ?? "/"))
  }, [props.open])

  return (
    <Sheet open={props.open} onClose={props.onClose} title={t("browse.title")} wide>
      <form
        class="row"
        onSubmit={(e) => {
          e.preventDefault()
          load(path.trim())
        }}
      >
        <button type="button" class="icon-btn" aria-label={t("browse.parent")} onClick={() => load(dirname(path))}>
          <Icon name="arrowUp" />
        </button>
        <input class="grow mono" value={path} onInput={(e) => setPath(e.currentTarget.value)} autoCapitalize="off" autoCorrect="off" spellcheck={false} />
        <button type="submit" class="btn small">
          {t("browse.go")}
        </button>
      </form>
      <ul class="pick-list dir-list">
        {loading && (
          <li class="empty small">
            <Spinner /> {t("common.loading")}
          </li>
        )}
        {error && <li class="empty small error">{error}</li>}
        {!loading &&
          entries.map((e) => (
            <li key={e.path}>
              <button onClick={() => load(e.path)}>
                <Icon name="folder" />
                <span class="ellipsis">{e.name}</span>
                <Icon name="chevronRight" />
              </button>
            </li>
          ))}
        {!loading && !error && !entries.length && <li class="empty small muted">{t("browse.empty")}</li>}
      </ul>
      <div class="row end">
        <button class="btn ghost" onClick={props.onClose}>
          {t("common.cancel")}
        </button>
        <button
          class="btn primary"
          disabled={!path}
          onClick={() => {
            props.onClose()
            setDirectory(path).catch((e) => fail(e))
            props.onPicked()
          }}
        >
          {t("browse.open")}
        </button>
      </div>
    </Sheet>
  )
}
