import { OpenCode } from "@opencode/client"
import type {
  FormInfo,
  ModelInfo,
  PermissionRequest,
  SessionInfo,
  SessionMessageAssistant,
  SessionMessageInfo,
  V2Event,
} from "@opencode/client"
import type {
  AssistantPart,
  Backend,
  BackendEvent,
  DirEntry,
  Form,
  FormField,
  Message,
  Model,
  ModelRef,
  Permission,
  Session,
  ToolPart,
  ToolStatus,
} from "./types"
import { basename, joinPath } from "./format"

type Client = ReturnType<typeof OpenCode.make>

export function createV2(client: Client, version: string): Backend {
  const at = (directory?: string) => (directory ? { location: { directory } } : {})

  return {
    kind: "v2",
    version,
    canCommitRevert: true,
    serverModelState: true,

    async info(signal) {
      const info = await client.server.info({ signal })
      return { kind: "v2", version: info.version }
    },

    async projects() {
      const list = await client.project.list()
      return list
        .map((p) => ({
          id: p.id,
          directory: p.canonical,
          name: basename(p.canonical),
          vcs: p.vcs,
          active: p.time.active ?? p.time.updated,
        }))
        .sort((a, b) => b.active - a.active)
    },

    async sessions({ projectID, directory, search, limit }) {
      // A project covers its subfolders too, so filter by project when there is a real one. Folders outside git
      // share the "global" project and are filtered by exact directory instead.
      const scope = projectID && projectID !== "global" ? { project: projectID } : directory ? { directory } : {}
      const res = await client.session.list({
        limit: limit ?? 100,
        order: "desc",
        parentID: null,
        ...scope,
        ...(search ? { search } : {}),
      })
      return res.data.map(toSession)
    },

    async session(id) {
      return toSession(await client.session.get({ sessionID: id }))
    },

    async createSession({ directory, model, agent }) {
      const created = await client.session.create({
        location: { directory },
        ...(model ? { model: { id: model.id, providerID: model.providerID, variant: model.variant } } : {}),
        ...(agent ? { agent } : {}),
      })
      return toSession(created)
    },

    async renameSession(id, title) {
      await client.session.update({ sessionID: id, title })
    },

    async deleteSession(id) {
      await client.session.remove({ sessionID: id })
    },

    async forkSession(id, beforeMessageID) {
      return toSession(await client.session.fork({ sessionID: id, ...(beforeMessageID ? { before: beforeMessageID } : {}) }))
    },

    async compactSession(id) {
      await client.session.compact({ sessionID: id })
    },

    async messages(sessionID, opts) {
      const limit = opts?.limit ?? 80
      const res = await client.message.list({
        sessionID,
        limit,
        ...(opts?.cursor ? { cursor: opts.cursor } : { order: "desc" }),
      })
      const messages = res.data.map(toMessage).filter((m): m is Message => m !== undefined)
      messages.sort((a, b) => a.created - b.created || (a.id < b.id ? -1 : 1))
      // The server returns a cursor even on the last page, so only a full page can have older messages.
      return { messages, older: res.data.length >= limit ? (res.cursor.next ?? undefined) : undefined }
    },

    async prompt(sessionID, { text, files }) {
      await client.session.prompt({
        sessionID,
        text,
        ...(files.length
          ? { files: files.map((f) => ({ uri: `data:${f.mime || "application/octet-stream"};base64,${f.data}`, name: f.name })) }
          : {}),
      })
    },

    async command(sessionID, name, text) {
      await client.session.command({ sessionID, name, text })
    },

    async shell(sessionID, command) {
      await client.session.shell({ sessionID, command })
    },

    async interrupt(sessionID) {
      await client.session.interrupt({ sessionID })
    },

    async busySessions() {
      return Object.keys(await client.session.active())
    },

    async models(directory) {
      const [list, def] = await Promise.all([
        client.model.list(at(directory)),
        client.model.default(at(directory)).catch(() => undefined),
      ])
      const providers = await client.provider.list(at(directory)).catch(() => undefined)
      const providerName = new Map((providers?.data ?? []).map((p) => [p.id, p.name]))
      const models = list.data
        .filter((m) => m.enabled && m.status !== "deprecated")
        .map((m) => toModel(m, providerName.get(m.providerID)))
      const d = def?.data
      return { models, default: d ? { providerID: d.providerID, id: d.id } : undefined }
    },

    async agents(directory) {
      const res = await client.agent.list(at(directory))
      return res.data
        .filter((a) => a.mode !== "subagent" && !a.hidden)
        .map((a) => ({ id: a.id, name: a.name, description: a.description }))
    },

    async commands(directory) {
      const res = await client.command.list(at(directory))
      return res.data.map((c) => ({ name: c.name, description: c.description }))
    },

    async switchModel(sessionID, model) {
      await client.session.switchModel({
        sessionID,
        model: { id: model.id, providerID: model.providerID, ...(model.variant ? { variant: model.variant } : {}) },
      })
    },

    async switchAgent(sessionID, agent) {
      await client.session.switchAgent({ sessionID, agent })
    },

    async revert(sessionID, messageID) {
      await client.session.revert.stage({ sessionID, messageID, files: true })
    },

    async unrevert(sessionID) {
      await client.session.revert.clear({ sessionID })
    },

    async commitRevert(sessionID) {
      await client.session.revert.commit({ sessionID })
    },

    async permissions(directory) {
      const res = await client.permission.request.list(at(directory))
      return res.data.map(toPermission)
    },

    async replyPermission(p, decision, message) {
      await client.permission.reply({
        sessionID: p.sessionID,
        requestID: p.id,
        decision,
        ...(message ? { message } : {}),
      })
    },

    async forms(directory) {
      const res = await client.form.list(at(directory))
      return res.data.map(toForm)
    },

    async replyForm(f, answer) {
      await client.session.form.reply({ sessionID: f.sessionID, formID: f.id, answer })
    },

    async cancelForm(f) {
      await client.session.form.cancel({ sessionID: f.sessionID, formID: f.id })
    },

    async exportSession(sessionID) {
      return client.session.export({ sessionID })
    },

    async diff(sessionID, range) {
      const list = await client.session.diff({ sessionID, ...(range?.from ? { from: range.from } : {}), ...(range?.to ? { to: range.to } : {}), context: 3 })
      return list.map((f) => ({ file: f.file, additions: f.additions, deletions: f.deletions, status: f.status, patch: f.patch }))
    },

    async listDirectory(directory) {
      const res = await client.file.list({ location: { directory } })
      return res.data
        .map((e): DirEntry => {
          // Directory entries come back as "name/"; a trailing slash would make a different project location.
          const rel = e.path.replace(/[\\/]+$/, "")
          return { name: basename(rel), path: joinPath(directory, rel), type: e.type }
        })
        .sort((a, b) => a.name.localeCompare(b.name))
    },

    async home() {
      const loc = await client.location.get().catch(() => undefined)
      return loc?.directory
    },

    async subscribe(handler, { signal, onActivity }) {
      for await (const event of client.event.subscribe({ signal, onActivity })) {
        for (const mapped of mapEvent(event)) handler(mapped)
      }
    },
  }
}

function toSession(s: SessionInfo): Session {
  return {
    id: s.id,
    title: s.title,
    projectID: s.projectID,
    directory: s.location.directory,
    parentID: s.parentID,
    created: s.time.created,
    updated: s.time.updated,
    model: s.model ? { providerID: s.model.providerID, id: s.model.id, variant: s.model.variant } : undefined,
    agent: s.agent,
    cost: s.cost ?? 0,
    tokens: {
      input: s.tokens?.input ?? 0,
      output: s.tokens?.output ?? 0,
      reasoning: s.tokens?.reasoning ?? 0,
      cacheRead: s.tokens?.cache?.read ?? 0,
    },
    revert: s.revert
      ? {
          messageID: s.revert.messageID,
          files: (s.revert.files ?? []).map((f) => ({
            file: f.file,
            additions: f.additions,
            deletions: f.deletions,
            status: f.status,
            patch: f.patch,
          })),
        }
      : undefined,
    outcome: s.outcome,
  }
}

function toModel(m: ModelInfo, providerName?: string): Model {
  return {
    providerID: m.providerID,
    id: m.id,
    name: m.name,
    providerName: providerName ?? m.providerID,
    variants: m.variants.map((v) => v.id),
    images: m.capabilities.input.includes("image"),
  }
}

function toPermission(p: PermissionRequest): Permission {
  return { id: p.id, sessionID: p.sessionID, action: p.action, resources: p.resources, save: p.save, message: p.message }
}

function toForm(f: FormInfo): Form {
  return {
    id: f.id,
    sessionID: f.sessionID,
    title: f.title,
    fields: f.fields.map((field): FormField => {
      if (field.type === "external") return { key: field.key, type: "external", title: field.title, description: field.description, url: field.url }
      const base = {
        key: field.key,
        title: field.title,
        description: field.description,
        required: field.required,
        default: field.default,
      }
      if (field.type === "string")
        return {
          ...base,
          type: "string",
          options: field.options?.map((o) => ({ value: String(o.value), label: o.label ?? String(o.value), description: o.description })),
          custom: field.custom,
          placeholder: field.placeholder,
        }
      if (field.type === "multiselect")
        return {
          ...base,
          type: "multiselect",
          options: field.options.map((o) => ({ value: String(o.value), label: o.label ?? String(o.value), description: o.description })),
          custom: field.custom,
        }
      if (field.type === "boolean") return { ...base, type: "boolean" }
      return { ...base, type: "number" }
    }),
  }
}

function toolText(content: ReadonlyArray<{ type: string; text?: string; name?: string }> | undefined) {
  if (!content) return undefined
  return content
    .map((c) => (c.type === "text" ? (c.text ?? "") : `[${c.type}${c.name ? `: ${c.name}` : ""}]`))
    .join("\n")
}

const toolStatus: Record<string, ToolStatus> = {
  streaming: "pending",
  running: "running",
  completed: "completed",
  error: "error",
}

function toAssistantParts(content: SessionMessageAssistant["content"]): AssistantPart[] {
  const counters = { text: 0, reasoning: 0 }
  return content.map((c): AssistantPart => {
    if (c.type === "text") return { type: "text", key: `text:${counters.text++}`, text: c.text }
    if (c.type === "reasoning") return { type: "reasoning", key: `reasoning:${counters.reasoning++}`, text: c.text }
    const state = c.state as {
      status: string
      input?: Record<string, unknown>
      content?: ReadonlyArray<{ type: string; text?: string }>
      error?: { message: string }
      metadata?: Record<string, unknown>
    }
    return {
      type: "tool",
      key: `tool:${c.id}`,
      id: c.id,
      name: c.name,
      status: toolStatus[state.status] ?? "running",
      input: state.input,
      output: toolText(state.content),
      error: state.error?.message,
      metadata: state.metadata,
    }
  })
}

function toMessage(m: SessionMessageInfo): Message | undefined {
  const created = m.time.created
  switch (m.type) {
    case "user":
      return {
        kind: "user",
        id: m.id,
        created,
        text: m.text,
        attachments: (m.files ?? []).map((f) => ({ name: f.name ?? f.mime, mime: f.mime })),
      }
    case "assistant":
      return {
        kind: "assistant",
        id: m.id,
        created,
        completed: m.time.completed,
        agent: m.agent,
        model: { providerID: m.model.providerID, id: m.model.id, variant: m.model.variant },
        parts: toAssistantParts(m.content),
        cost: m.cost,
        tokens: m.tokens ? { input: m.tokens.input, output: m.tokens.output } : undefined,
        error: m.error?.message,
        finish: m.finish,
        files: m.snapshot?.files?.length ? [...m.snapshot.files] : undefined,
      }
    case "idle":
      if (m.outcome === "succeeded") return undefined
      return {
        kind: "notice",
        id: m.id,
        created,
        tone: m.outcome === "failed" ? "error" : "muted",
        text: m.outcome === "failed" ? `Failed: ${m.error?.message ?? "unknown error"}` : "Interrupted",
      }
    case "agent-switched":
      return { kind: "notice", id: m.id, created, tone: "muted", text: `Agent → ${m.agent}` }
    case "model-switched":
      return {
        kind: "notice",
        id: m.id,
        created,
        tone: "muted",
        text: `Model → ${m.model.providerID}/${m.model.id}${m.model.variant ? ` (${m.model.variant})` : ""}`,
      }
    case "location-switched":
      return { kind: "notice", id: m.id, created, tone: "muted", text: `Moved to ${m.location.directory}` }
    case "compaction":
      return {
        kind: "notice",
        id: m.id,
        created,
        tone: m.status === "failed" ? "error" : "info",
        text: m.status === "completed" ? "Context compacted" : m.status === "failed" ? "Compaction failed" : "Compacting context…",
        detail: m.status === "completed" ? m.summary : undefined,
      }
    case "shell":
      return {
        kind: "notice",
        id: m.id,
        created,
        tone: "info",
        text: `$ ${m.command}${m.status === "running" ? " (running)" : m.exit !== undefined && m.exit !== 0 ? ` (exit ${m.exit})` : ""}`,
        detail: m.output?.output,
      }
    case "synthetic":
    case "system":
      return { kind: "notice", id: m.id, created, tone: "muted", text: m.description ?? "Context added", detail: m.text }
    case "skill":
      return { kind: "notice", id: m.id, created, tone: "muted", text: `Skill: ${m.name}`, detail: m.text }
  }
}

function mapEvent(e: V2Event): BackendEvent[] {
  switch (e.type) {
    case "server.connected":
      return [{ type: "connected" }]
    case "session.created":
      return [
        {
          type: "session.upsert",
          session: {
            id: e.data.sessionID,
            directory: e.data.location.directory,
            projectID: e.data.projectID,
            created: e.created,
            updated: e.created,
          },
        },
        { type: "projects.invalidate", directory: e.data.location.directory },
      ]
    case "session.renamed":
      return [{ type: "session.upsert", session: { id: e.data.sessionID, title: e.data.title } }]
    case "session.deleted":
    case "session.archived":
      return [{ type: "session.deleted", sessionID: e.data.sessionID }]
    case "session.model.selected":
      return [{ type: "session.upsert", session: { id: e.data.sessionID, model: e.data.model as ModelRef } }]
    case "session.agent.selected":
      return [{ type: "session.upsert", session: { id: e.data.sessionID, agent: e.data.agent } }]
    case "session.usage.updated":
      return [
        {
          type: "session.upsert",
          session: {
            id: e.data.sessionID,
            cost: e.data.cost,
            tokens: {
              input: e.data.tokens.input,
              output: e.data.tokens.output,
              reasoning: e.data.tokens.reasoning,
              cacheRead: e.data.tokens.cache.read,
            },
          },
        },
      ]
    case "session.execution.started":
      return [{ type: "session.busy", sessionID: e.data.sessionID, busy: true }]
    case "session.execution.succeeded":
    case "session.execution.failed":
    case "session.execution.interrupted":
      return [
        { type: "session.busy", sessionID: e.data.sessionID, busy: false },
        { type: "session.invalidate", sessionID: e.data.sessionID, messages: true },
      ]
    case "session.idle":
      return [{ type: "session.busy", sessionID: e.data.sessionID, busy: false }]
    case "session.status": {
      const status = e.data.status
      return [
        {
          type: "session.busy",
          sessionID: e.data.sessionID,
          busy: status.type !== "idle",
          retry: status.type === "retry" ? status.message : undefined,
        },
      ]
    }
    case "session.inbox.enqueued": {
      const item = e.data.item as { type: string; payload?: { text?: string } }
      if (item.type !== "user") return []
      return [
        { type: "message.user", sessionID: e.data.sessionID, messageID: e.data.inboxID, text: item.payload?.text ?? "", pending: true },
      ]
    }
    case "session.inbox.delivered":
    case "session.inbox.cancelled":
    case "session.step.ended":
    case "session.step.failed":
    case "session.compaction.started":
    case "session.compaction.ended":
    case "session.compaction.failed":
    case "session.shell.started":
    case "session.shell.ended":
    case "session.synthetic":
    case "session.skill.activated":
      return [{ type: "session.invalidate", sessionID: e.data.sessionID, messages: true }]
    case "session.revert.staged":
    case "session.revert.cleared":
    case "session.revert.committed":
    case "session.moved":
    case "session.forked":
      return [{ type: "session.invalidate", sessionID: e.data.sessionID, messages: true }]
    case "session.step.started":
      return [
        {
          type: "message.assistant",
          sessionID: e.data.sessionID,
          messageID: e.data.assistantMessageID,
          agent: e.data.agent,
          model: e.data.model as ModelRef,
        },
      ]
    case "session.text.started":
    case "session.reasoning.started":
      return [textEvent(e.data, e.type === "session.text.started" ? "text" : "reasoning", { text: "" })]
    case "session.text.delta":
    case "session.reasoning.delta":
      return [textEvent(e.data, e.type === "session.text.delta" ? "text" : "reasoning", { delta: e.data.delta })]
    case "session.text.ended":
    case "session.reasoning.ended":
      return [textEvent(e.data, e.type === "session.text.ended" ? "text" : "reasoning", { text: e.data.text, done: true })]
    case "session.tool.input.started":
      return [toolEvent(e.data, { name: e.data.name, status: "pending", inputText: "" })]
    case "session.tool.input.delta":
      return [{ ...toolEvent(e.data, {}), inputDelta: e.data.delta }]
    case "session.tool.input.ended":
      return [toolEvent(e.data, { inputText: e.data.text })]
    case "session.tool.called":
      return [toolEvent(e.data, { status: "running", input: e.data.input as Record<string, unknown> })]
    case "session.tool.progress":
      return [toolEvent(e.data, { metadata: e.data.metadata as Record<string, unknown> })]
    case "session.tool.success":
      return [
        toolEvent(e.data, {
          status: "completed",
          output: toolText(e.data.content as ReadonlyArray<{ type: string; text?: string }>),
          metadata: e.data.metadata as Record<string, unknown>,
        }),
      ]
    case "session.tool.failed":
      return [
        toolEvent(e.data, {
          status: "error",
          error: e.data.error.message,
          output: toolText(e.data.content as ReadonlyArray<{ type: string; text?: string }> | undefined),
        }),
      ]
    case "permission.asked":
      return [{ type: "permission.asked", permission: toPermission(e.data as PermissionRequest) }]
    case "permission.replied":
      return [{ type: "permission.replied", sessionID: e.data.sessionID, id: e.data.requestID }]
    case "form.created":
      return [{ type: "form.created", form: toForm(e.data.form as FormInfo) }]
    case "form.replied":
    case "form.cancelled":
      return [{ type: "form.done", sessionID: e.data.sessionID, id: e.data.id }]
    case "project.updated":
      return [{ type: "projects.invalidate" }]
    default:
      return []
  }
}

function textEvent(
  data: { sessionID: string; assistantMessageID: string; ordinal: number },
  kind: "text" | "reasoning",
  rest: { delta?: string; text?: string; done?: boolean },
): BackendEvent {
  return {
    type: "part.text",
    sessionID: data.sessionID,
    messageID: data.assistantMessageID,
    key: `${kind}:${data.ordinal}`,
    kind,
    ...rest,
  }
}

function toolEvent(data: { sessionID: string; assistantMessageID: string; id: string }, tool: Partial<ToolPart>) {
  return {
    type: "part.tool" as const,
    sessionID: data.sessionID,
    messageID: data.assistantMessageID,
    tool: { ...tool, id: data.id },
  }
}
