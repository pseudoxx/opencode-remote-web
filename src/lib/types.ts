import type { MessageKey, Params } from "../i18n"

// Normalized data model shared by every server adapter. It follows OpenCode v2's shapes closely, since v2 is the
// primary target, but only carries what the UI renders.

export type ModelRef = { providerID: string; id: string; variant?: string }

export type Model = {
  providerID: string
  id: string
  name: string
  providerName: string
  variants: string[]
  images: boolean
}

export type Agent = { id: string; name: string; description?: string }

export type Project = { id: string; directory: string; name: string; vcs?: string; active: number }

export type FileDiff = { file: string; additions: number; deletions: number; status: string; patch?: string }

export type Revert = { messageID: string; files: FileDiff[] }

export type Session = {
  id: string
  title?: string
  projectID?: string
  directory: string
  parentID?: string
  created: number
  updated: number
  model?: ModelRef
  agent?: string
  cost: number
  tokens: { input: number; output: number; reasoning: number; cacheRead: number }
  revert?: Revert
  outcome?: "succeeded" | "failed" | "interrupted"
}

export type ToolStatus = "pending" | "running" | "completed" | "error"

export type TextPart = { type: "text"; key: string; text: string; streaming?: boolean }
export type ReasoningPart = { type: "reasoning"; key: string; text: string; streaming?: boolean }
export type ToolPart = {
  type: "tool"
  key: string
  id: string
  name: string
  status: ToolStatus
  input?: Record<string, unknown>
  inputText?: string
  output?: string
  error?: string
  metadata?: Record<string, unknown>
}
export type AssistantPart = TextPart | ReasoningPart | ToolPart

export type Attachment = { name: string; mime: string }

export type UserMessage = {
  kind: "user"
  id: string
  created: number
  text: string
  attachments: Attachment[]
  pending?: boolean
}

export type AssistantMessage = {
  kind: "assistant"
  id: string
  created: number
  completed?: number
  agent?: string
  model?: ModelRef
  parts: AssistantPart[]
  cost?: number
  tokens?: { input: number; output: number }
  error?: string
  finish?: string
  // Files this turn changed, when the server reports them.
  files?: string[]
}

// Everything else (agent/model switches, idle markers, compaction, shell runs, injected text) renders as a
// compact notice line with optional detail.
// Text is a message key plus parameters, translated when shown, so it follows the UI language.
export type NoticeMessage = {
  kind: "notice"
  id: string
  created: number
  tone: "info" | "error" | "muted"
  key: MessageKey
  params?: Params
  detail?: string
}

export type Message = UserMessage | AssistantMessage | NoticeMessage

export type Permission = {
  id: string
  sessionID: string
  action: string
  resources: string[]
  save?: string[]
  message?: string
}

export type FormOption = { value: string; label: string; description?: string }
export type FormField = {
  key: string
  type: "string" | "number" | "boolean" | "multiselect" | "external"
  title?: string
  description?: string
  required?: boolean
  options?: FormOption[]
  custom?: boolean
  placeholder?: string
  url?: string
  default?: unknown
}
export type Form = { id: string; sessionID: string; title: string; fields: FormField[] }

export type Command = { name: string; description?: string }

export type DirEntry = { name: string; path: string; type: "file" | "directory" }

export type ServerKind = "v2" | "v1"

export type ServerInfo = { kind: ServerKind; version: string }

// Events coming off the server stream, normalized. The store applies them to its in-memory state.
export type BackendEvent =
  | { type: "connected" }
  | { type: "session.upsert"; session: Partial<Session> & { id: string } }
  | { type: "session.deleted"; sessionID: string }
  | { type: "session.busy"; sessionID: string; busy: boolean; retry?: string }
  | { type: "session.invalidate"; sessionID: string; messages?: boolean }
  | { type: "message.assistant"; sessionID: string; messageID: string; agent?: string; model?: ModelRef }
  | { type: "message.user"; sessionID: string; messageID: string; text: string; pending?: boolean }
  | {
      type: "part.text"
      sessionID: string
      messageID: string
      key: string
      kind: "text" | "reasoning"
      delta?: string
      text?: string
      done?: boolean
    }
  | {
      type: "part.tool"
      sessionID: string
      messageID: string
      tool: Partial<ToolPart> & { id: string }
      inputDelta?: string
    }
  | { type: "permission.asked"; permission: Permission }
  | { type: "permission.replied"; sessionID: string; id: string }
  | { type: "form.created"; form: Form }
  | { type: "form.done"; sessionID: string; id: string }
  | { type: "projects.invalidate"; directory?: string }

export type MessagePage = { messages: Message[]; older?: string }

export type PromptFile = { name: string; mime: string; data: string }

export interface Backend {
  readonly kind: ServerKind
  readonly version: string
  // v2 keeps reverted messages until they are committed or cleared; 1.x drops them with the next prompt.
  readonly canCommitRevert: boolean
  // v2 stores the session's model/agent on the server; 1.x takes them with each prompt, so the app remembers them.
  readonly serverModelState: boolean
  info(signal?: AbortSignal): Promise<ServerInfo>
  projects(): Promise<Project[]>
  sessions(opts: { projectID?: string; directory?: string; search?: string; limit?: number }): Promise<Session[]>
  session(id: string): Promise<Session>
  createSession(opts: { directory: string; model?: ModelRef; agent?: string }): Promise<Session>
  renameSession(id: string, title: string): Promise<void>
  deleteSession(id: string): Promise<void>
  forkSession(id: string, beforeMessageID?: string): Promise<Session>
  compactSession(id: string): Promise<void>
  messages(sessionID: string, opts?: { limit?: number; cursor?: string }): Promise<MessagePage>
  prompt(sessionID: string, input: { text: string; files: PromptFile[]; model?: ModelRef; agent?: string }): Promise<void>
  command(sessionID: string, command: string, args: string): Promise<void>
  shell(sessionID: string, command: string): Promise<void>
  interrupt(sessionID: string): Promise<void>
  busySessions(): Promise<string[]>
  models(directory?: string): Promise<{ models: Model[]; default?: ModelRef }>
  agents(directory?: string): Promise<Agent[]>
  commands(directory?: string): Promise<Command[]>
  switchModel(sessionID: string, model: ModelRef): Promise<void>
  switchAgent(sessionID: string, agent: string): Promise<void>
  revert(sessionID: string, messageID: string): Promise<void>
  unrevert(sessionID: string): Promise<void>
  commitRevert(sessionID: string): Promise<void>
  permissions(directory?: string): Promise<Permission[]>
  replyPermission(p: Permission, decision: "once" | "always" | "reject", message?: string): Promise<void>
  forms(directory?: string): Promise<Form[]>
  replyForm(f: Form, answer: Record<string, string | number | boolean | string[]>): Promise<void>
  cancelForm(f: Form): Promise<void>
  exportSession(sessionID: string): Promise<unknown>
  // File changes made by the agent: a single turn (from = its user message) or the range from..to.
  diff(sessionID: string, range?: { from?: string; to?: string }): Promise<FileDiff[]>
  listDirectory(directory: string): Promise<DirEntry[]>
  home(): Promise<string | undefined>
  // Paths that reveal the server's OS (home or working folder, temp folder).
  hostPaths(): Promise<string[]>
  subscribe(handler: (event: BackendEvent) => void, opts: { signal: AbortSignal; onActivity: () => void }): Promise<void>
}
