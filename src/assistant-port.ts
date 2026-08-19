/**
 * Host-side assistant port: projects the assistant session log into the wire
 * snapshot and drives user messages into the session (T1.2).
 */

import type {
  AssistantDisplayBlock,
  AssistantItem,
  AssistantMessage,
  AssistantSnapshot,
  ContextChrome,
  GoalItem,
  ModelChrome,
  PluginItem,
  SendImage,
  SendReply,
  TaskReferenceReceipt,
  TimelineItem,
  TodoItem,
  ToolItem,
  UserItem,
} from './contract.ts'

const TASK_REFERENCE_PLUGIN = 'dsh-llm-assistant:task-reference'
const VISIBLE_PLUGIN_SOURCES = new Set(['schedule', 'dsh-llm-assistant', 'dsh-llm-assistant-duty'])

/** Host view of the live assistant agent (subset of dsh-agent's Agent). */
export interface AssistantAgentView {
  readonly id: string
  readonly status: string
  readonly session: AssistantSessionView
  followup(message: unknown): void
  inject(message: unknown): void
  runMaintenance<T>(task: () => Promise<T>): Promise<T>
}

export interface AssistantSessionView {
  readonly id: string
  readonly seq: number
  readonly header: { readonly cwd?: string; readonly seedLength?: number }
  readonly events: readonly AssistantEvent[]
  append(type: string, data: unknown): unknown
}

export interface AssistantEvent {
  readonly type: string
  readonly seq: number
  readonly time: number
  readonly data: Record<string, unknown>
}

/** Runtime-resolved helpers (SessionId brand + createUserMessage). */
export interface AssistantRuntimeApi {
  readonly SessionId: (id: string) => string
  readonly installModelSelection?: (
    agentCtx: { on: (name: string, listener: (...args: never[]) => unknown) => unknown },
    selection: { current: { provider: string; model: string; reasoningEffort?: string } | undefined; assembled: unknown },
  ) => () => void
  readonly foldScheduleEvents?: import('./schedule-migration.ts').FoldScheduleEvents
  readonly createUserMessage: (input: {
    readonly content: readonly (
      | { readonly type: 'text'; readonly text: string }
      | { readonly type: 'image'; readonly attachment: ImageAttachmentRef }
    )[]
    readonly source:
      | { readonly kind: 'user' }
      | { readonly kind: 'plugin'; readonly plugin: string }
  }) => unknown
}

export interface ImageAttachmentRef {
  readonly attachmentId: string
  readonly mediaType: string
  readonly bytes: number
  readonly width: number
  readonly height: number
  readonly name?: string
}

export interface AttachmentStoreView {
  saveImage(input: { data: Uint8Array; mediaType: 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif'; name?: string }): Promise<ImageAttachmentRef>
  readImage(ref: ImageAttachmentRef): Promise<{ ref: ImageAttachmentRef; data: Uint8Array }>
}

export interface AssistantChrome {
  readonly model?: ModelChrome
  readonly contextCap?: number
  readonly notice?: string
}

export interface AssistantPort {
  snapshot(): AssistantSnapshot
  send(text: string, images?: readonly SendImage[]): Promise<SendReply>
  readImage(attachmentId: string): Promise<{ mediaType: string; dataBase64: string } | undefined>
  sessionHasImages(): boolean
}

/** Compact status for the duty heartbeat — todos/goal/last visible assistant line. */
export function assistantBrief(events: readonly AssistantEvent[]): {
  todos: readonly TodoItem[]
  goal: GoalItem | undefined
  lastAssistant: string | undefined
} {
  const projected = project(events)
  const last = [...projected.items].reverse().find((item) => item.kind === 'assistant' && item.text.trim() !== '')
  return {
    todos: projected.todos,
    goal: projected.goal,
    lastAssistant: last !== undefined && last.kind === 'assistant' ? last.text.slice(0, 400) : undefined,
  }
}

export function createAssistantPort(
  agent: AssistantAgentView,
  api: AssistantRuntimeApi,
  revision: () => number,
  chrome: () => AssistantChrome = () => ({}),
  attachments?: AttachmentStoreView,
  taskReferenceAvailable = false,
): AssistantPort {
  return {
    snapshot(): AssistantSnapshot {
      const projected = project(agent.session.events)
      const status = projected.turnStartTime !== undefined || projected.pending !== '' || projected.thinking !== '' ? 'running' : 'idle'
      const extra = chrome()
      return {
        sessionId: agent.id,
        seq: agent.session.seq,
        status,
        messages: projected.messages,
        items: projected.items,
        revision: revision(),
        ...(projected.pending !== '' ? { pending: projected.pending } : {}),
        ...(projected.thinking !== '' ? { thinking: projected.thinking } : {}),
        ...(status === 'running' && projected.currentTool !== undefined ? { currentTool: projected.currentTool } : {}),
        ...(status === 'running' && projected.turnStartTime !== undefined ? { turnStartTime: projected.turnStartTime } : {}),
        ...(extra.model !== undefined ? { model: extra.model } : {}),
        ...(projected.context !== undefined ? { context: withContextCap(projected.context, extra.contextCap) } : {}),
        ...(projected.todos.length > 0 ? { todos: projected.todos } : {}),
        ...(projected.goal !== undefined ? { goal: projected.goal } : {}),
        taskReferenceAvailable,
        ...(extra.notice !== undefined ? { notice: extra.notice } : {}),
      }
    },
    async send(text: string, images?: readonly SendImage[]): Promise<SendReply> {
      const trimmed = text.trim()
      const incoming = images ?? []
      if (trimmed === '' && incoming.length === 0) return { sent: false, error: 'empty message' }
      try {
        const content: ({ type: 'text'; text: string } | { type: 'image'; attachment: ImageAttachmentRef })[] = []
        if (trimmed !== '') content.push({ type: 'text', text: trimmed })
        for (const image of incoming) {
          if (attachments === undefined) return { sent: false, error: 'attachments service is not available' }
          const mediaType = asImageMediaType(image.mediaType)
          if (mediaType === undefined) return { sent: false, error: 'unsupported image type: ' + image.mediaType }
          const data = Uint8Array.from(Buffer.from(image.dataBase64, 'base64'))
          const attachment = await attachments.saveImage({
            data,
            mediaType,
            name: image.name,
          })
          content.push({ type: 'image', attachment })
        }
        agent.followup(api.createUserMessage({ content, source: { kind: 'user' } }))
        return { sent: true }
      } catch (error) {
        return { sent: false, error: error instanceof Error ? error.message : String(error) }
      }
    },
    async readImage(attachmentId: string) {
      if (attachments === undefined) return undefined
      const ref = findImageRef(agent.session.events, attachmentId)
      if (ref === undefined) return undefined
      const stored = await attachments.readImage(ref)
      return { mediaType: stored.ref.mediaType, dataBase64: Buffer.from(stored.data).toString('base64') }
    },
    sessionHasImages() {
      return findImageRef(agent.session.events) !== undefined
    },
  }
}

function project(events: readonly AssistantEvent[]): {
  readonly messages: readonly AssistantMessage[]
  readonly items: readonly TimelineItem[]
  readonly pending: string
  readonly thinking: string
  readonly currentTool: string | undefined
  readonly turnStartTime: number | undefined
  readonly context: ContextChrome
  readonly todos: readonly TodoItem[]
  readonly goal: GoalItem | undefined
} {
  const messages: AssistantMessage[] = []
  const items: TimelineItem[] = []
  const tools = new Map<string, ToolItem>()
  let pendingParts: string[] = []
  let thinkingParts: string[] = []
  let currentTool: string | undefined
  let turnStartTime: number | undefined
  let todos: TodoItem[] = []
  let goal: GoalItem | undefined
  let messageChars = 0
  let toolChars = 0

  for (const event of events) {
    const data = event.data
    if (event.type === 'turn/start' || event.type === 'step/start') {
      if (event.type === 'turn/start') turnStartTime = event.time
      pendingParts = []
      thinkingParts = []
    } else if (event.type === 'assistant/message') {
      const message = data.message as { content?: readonly unknown[] } | undefined
      const blocks = assistantDisplayBlocksOf(message?.content)
      const text = blocks.filter((block) => block.kind === 'text').map((block) => block.text).join('')
      if (blocks.length > 0) {
        const item: AssistantItem = { kind: 'assistant', seq: event.seq, text, blocks, time: event.time }
        items.push(item)
        messages.push({ seq: event.seq, role: 'assistant', text, source: 'model', time: event.time })
        messageChars += text.length
      }
      pendingParts = []
    } else if (event.type === 'assistant/chunk') {
      const chunk = data.chunk as { type?: unknown; text?: unknown; name?: unknown; reason?: { kind?: unknown; failure?: { message?: unknown }; error?: { message?: unknown } } } | undefined
      if (chunk?.type === 'text-delta' && typeof chunk.text === 'string') {
        pendingParts.push(chunk.text)
      } else if (chunk?.type === 'reasoning-delta' && typeof chunk.text === 'string') {
        thinkingParts.push(chunk.text)
      } else if (chunk?.type === 'tool-call-delta' && typeof chunk.name === 'string') {
        currentTool = chunk.name
      } else if (chunk?.type === 'finish' && chunk.reason?.kind === 'error') {
        const text = typeof chunk.reason.failure?.message === 'string'
          ? chunk.reason.failure.message
          : typeof chunk.reason.error?.message === 'string'
            ? chunk.reason.error.message
            : '模型请求失败'
        items.push({ kind: 'error', seq: event.seq, text })
        pendingParts = []
        thinkingParts = []
      }
    } else if (event.type === 'user/message') {
      const source = data.source as { kind?: unknown; plugin?: unknown } | undefined
      if (source?.kind === 'plugin' && source.plugin === TASK_REFERENCE_PLUGIN) {
        const receipt = taskReceiptMessage(data)
        if (receipt !== undefined) items.push({ kind: 'task-reference', seq: event.seq, receipt })
      } else if (source?.kind === 'plugin' && typeof source.plugin === 'string' && VISIBLE_PLUGIN_SOURCES.has(source.plugin)) {
        const text = textOfBlocks(data.content as readonly unknown[] | undefined)
        if (text !== '') {
          const item: PluginItem = {
            kind: 'plugin',
            seq: event.seq,
            plugin: source.plugin,
            text,
            time: event.time,
            source: sourceLabel(data.source),
          }
          items.push(item)
        }
      } else if (source?.kind === 'user') {
        const text = textOfBlocks(data.content as readonly unknown[] | undefined)
        const images = imageRefsOf(data.content as readonly unknown[] | undefined)
        if (text !== '' || images.length > 0) {
          const item: UserItem = {
            kind: 'user',
            seq: event.seq,
            text,
            time: event.time,
            source: sourceLabel(data.source),
            ...(images.length > 0 ? { images } : {}),
          }
          items.push(item)
          messages.push({ seq: event.seq, role: 'user', text, source: item.source, time: event.time })
          messageChars += text.length
        }
      }
    } else if (event.type === 'tool/call') {
      const name = typeof data.name === 'string' ? data.name : 'tool'
      currentTool = name
      const callId = callIdOf(data, event.seq)
      const rawInput = data.arguments ?? data.args
      const summary = summarizeArgs(name, rawInput, callId)
      const input = displayPayload(rawInput)
      const item: ToolItem = { kind: 'tool', seq: event.seq, name, status: 'running', summary, ...(input === undefined ? {} : { input }) }
      tools.set(callId, item)
      items.push(item)
      toolChars += summary.length + name.length
      const nextTodos = todosFromTool(name, data.arguments ?? data.args)
      if (nextTodos !== undefined) todos = nextTodos
      const nextGoal = goalFromTool(name, data.arguments ?? data.args)
      if (nextGoal !== undefined) goal = nextGoal
    } else if (event.type === 'tool/result') {
      const callId = resultCallIdOf(data)
      const existing = tools.get(callId)
      if (existing !== undefined) {
        const isError = toolResultIsError(data)
        const output = toolResultText(data)
        const updated: ToolItem = {
          ...existing,
          status: isError ? 'error' : 'done',
          summary: existing.summary,
          ...(output === undefined ? {} : { output }),
        }
        tools.set(callId, updated)
        const index = items.findIndex((entry) => entry.kind === 'tool' && entry.seq === existing.seq)
        if (index >= 0) items[index] = updated
      }
    } else if (event.type === 'turn/end') {
      for (const [callId, tool] of tools) {
        if (tool.status !== 'running') continue
        const stopped: ToolItem = { ...tool, status: 'stopped' }
        tools.set(callId, stopped)
        const index = items.findIndex((entry) => entry.kind === 'tool' && entry.seq === tool.seq)
        if (index >= 0) items[index] = stopped
      }
      currentTool = undefined
      turnStartTime = undefined
      const reason = data.reason as { kind?: unknown; error?: { message?: unknown } } | undefined
      const errorText = reason?.kind === 'error' && typeof reason.error?.message === 'string' ? reason.error.message : undefined
      if (errorText !== undefined) {
        const already = items.some((item) => item.kind === 'error' && item.text === errorText)
        if (!already) items.push({ kind: 'error', seq: event.seq, text: errorText })
      }
      pendingParts = []
      thinkingParts = []
    }
  }

  const used = Math.max(1, Math.round((messageChars + toolChars) / 4))
  const cap = 128_000
  const context: ContextChrome = {
    used: Math.min(used, cap),
    cap,
    system: 0,
    tools: Math.round(toolChars / 4),
    messages: Math.round(messageChars / 4),
  }

  return { messages, items, pending: pendingParts.join(''), thinking: thinkingParts.join(''), currentTool, turnStartTime, context, todos, goal }
}

function assistantDisplayBlocksOf(blocks: readonly unknown[] | undefined): AssistantDisplayBlock[] {
  if (blocks === undefined) return []
  const out: AssistantDisplayBlock[] = []
  for (const block of blocks) {
    const candidate = block as { type?: unknown; text?: unknown } | undefined
    if ((candidate?.type === 'text' || candidate?.type === 'reasoning') && typeof candidate.text === 'string' && candidate.text !== '') {
      out.push({ kind: candidate.type, text: candidate.text })
    }
  }
  return out
}

function textOfBlocks(blocks: readonly unknown[] | undefined): string {
  if (blocks === undefined) return ''
  const out: string[] = []
  for (const block of blocks) {
    const candidate = block as { type?: unknown; text?: unknown } | undefined
    if (candidate?.type === 'text' && typeof candidate.text === 'string') out.push(candidate.text)
  }
  return out.join('')
}

function displayPayload(value: unknown): string | undefined {
  if (value === undefined) return undefined
  let parsed: unknown = value
  if (typeof value === 'string') {
    try { parsed = JSON.parse(value) as unknown } catch { return clipPayload(value) }
  }
  try { return clipPayload(JSON.stringify(parsed, null, 2)) } catch { return clipPayload(String(parsed)) }
}

function toolResultText(data: Record<string, unknown>): string | undefined {
  const message = isObject(data.message) ? data.message : undefined
  if (Array.isArray(message?.content)) {
    for (const block of message.content) {
      if (!isObject(block) || block.type !== 'tool-result') continue
      const content = block.content
      if (typeof content === 'string') return clipPayload(content)
      if (Array.isArray(content)) {
        const text = content.filter(isObject).filter((entry) => entry.type === 'text' && typeof entry.text === 'string').map((entry) => entry.text as string).join('')
        if (text !== '') return clipPayload(text)
      }
      const shown = displayPayload(content)
      if (shown !== undefined) return shown
    }
  }
  return displayPayload(data.result ?? data.output)
}

function clipPayload(value: string): string {
  const limit = 24_000
  return value.length <= limit ? value : value.slice(0, limit) + '\n… truncated'
}

function imageRefsOf(blocks: readonly unknown[] | undefined): { attachmentId: string; mediaType: string; name?: string }[] {
  if (blocks === undefined) return []
  const images: { attachmentId: string; mediaType: string; name?: string }[] = []
  for (const block of blocks) {
    const candidate = block as { type?: unknown; attachment?: Record<string, unknown> } | undefined
    const attachment = candidate?.attachment
    if (candidate?.type !== 'image' || attachment === undefined) continue
    if (typeof attachment.attachmentId !== 'string' || typeof attachment.mediaType !== 'string') continue
    images.push({
      attachmentId: attachment.attachmentId,
      mediaType: attachment.mediaType,
      ...(typeof attachment.name === 'string' ? { name: attachment.name } : {}),
    })
  }
  return images
}

function asImageMediaType(value: string): 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif' | undefined {
  if (value === 'image/png' || value === 'image/jpeg' || value === 'image/webp' || value === 'image/gif') return value
  if (value === 'image/jpg') return 'image/jpeg'
  return undefined
}

function findImageRef(events: readonly AssistantEvent[], attachmentId?: string): ImageAttachmentRef | undefined {
  for (const event of events) {
    const content = event.type === 'user/message'
      ? event.data.content
      : event.type === 'assistant/message'
        ? (event.data.message as { content?: unknown } | undefined)?.content
        : undefined
    if (!Array.isArray(content)) continue
    for (const block of content) {
      const candidate = block as { type?: unknown; attachment?: ImageAttachmentRef } | undefined
      if (candidate?.type !== 'image' || candidate.attachment === undefined) continue
      if (attachmentId === undefined || candidate.attachment.attachmentId === attachmentId) return candidate.attachment
    }
  }
  return undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function taskReceiptMessage(data: Record<string, unknown>): TaskReferenceReceipt | undefined {
  const source = data.source as { kind?: unknown; plugin?: unknown } | undefined
  if (source?.kind !== 'plugin' || source.plugin !== TASK_REFERENCE_PLUGIN) return undefined
  const text = textOfBlocks(data.content as readonly unknown[] | undefined)
  try {
    return taskReceiptOf(JSON.parse(text))
  } catch {
    return undefined
  }
}

function taskReceiptOf(value: unknown): TaskReferenceReceipt | undefined {
  if (!isRecord(value) || typeof value.taskId !== 'string' || typeof value.label !== 'string') return undefined
  if (!Number.isSafeInteger(value.totalSessions) || !Number.isSafeInteger(value.omittedSessions)) return undefined
  if (!Array.isArray(value.sourceSessionIds) || !value.sourceSessionIds.every((id) => typeof id === 'string')) return undefined
  return {
    taskId: value.taskId,
    label: value.label,
    totalSessions: value.totalSessions as number,
    omittedSessions: value.omittedSessions as number,
    sourceSessionIds: value.sourceSessionIds as string[],
  }
}

function sourceLabel(source: unknown): string {
  const candidate = source as { kind?: unknown; plugin?: unknown } | undefined
  if (candidate?.kind === 'plugin' && typeof candidate.plugin === 'string') return 'plugin:' + candidate.plugin
  if (typeof candidate?.kind === 'string') return candidate.kind
  return 'unknown'
}

function callIdOf(data: Record<string, unknown>, seq: number): string {
  if (typeof data.id === 'string') return data.id
  if (typeof data.callId === 'string') return data.callId
  return 'seq:' + String(typeof data.seq === 'number' ? data.seq : seq)
}

function withContextCap(context: ContextChrome, cap: number | undefined): ContextChrome {
  if (cap === undefined || cap <= 0) return context
  return { ...context, cap, used: Math.min(context.used, cap) }
}

function resultCallIdOf(data: Record<string, unknown>): string {
  if (typeof data.toolCallId === 'string') return data.toolCallId
  if (typeof data.callId === 'string') return data.callId
  if (typeof data.id === 'string') return data.id
  const message = isObject(data.message) ? data.message : undefined
  const source = message !== undefined && isObject(message.source) ? message.source : undefined
  if (typeof source?.callId === 'string') return source.callId
  const result = Array.isArray(message?.content) ? message.content.find((block) => isObject(block) && block.type === 'tool-result') : undefined
  return isObject(result) && typeof result.toolCallId === 'string' ? result.toolCallId : ''
}

function toolResultIsError(data: Record<string, unknown>): boolean {
  if (data.isError === true) return true
  const message = isObject(data.message) ? data.message : undefined
  return Array.isArray(message?.content) && message.content.some((block) => isObject(block) && block.type === 'tool-result' && block.isError === true)
}

function summarizeArgs(name: string, value: unknown, callId: string): string {
  const raw = typeof value === 'string' ? value : value === undefined ? '' : safeJson(value)
  if (raw === '') return callId
  let parsed: unknown
  try { parsed = JSON.parse(raw) as unknown } catch { return clip(firstLine(raw), 80) }
  if (!isObject(parsed)) return clip(firstLine(raw), 80)
  const keys = SUMMARY_KEYS[toolVariant(name)]
  for (const key of keys) {
    const candidate = parsed[key]
    if (typeof candidate === 'string' && candidate !== '') return clip(firstLine(candidate), 80)
  }
  for (const candidate of Object.values(parsed)) {
    if (typeof candidate === 'string' && candidate !== '') return clip(firstLine(candidate), 80)
  }
  return clip(firstLine(raw), 80)
}

function safeJson(value: unknown): string {
  try { return JSON.stringify(value) } catch { return String(value) }
}

function firstLine(value: string): string {
  const newline = value.indexOf('\n')
  return newline === -1 ? value : value.slice(0, newline)
}

type ToolVariant = 'search' | 'read' | 'bash' | 'write' | 'edit' | 'code' | 'others'

function toolVariant(name: string): ToolVariant {
  return TOOL_VARIANTS[name] ?? 'others'
}

const TOOL_VARIANTS: Readonly<Record<string, ToolVariant>> = {
  bash: 'bash', pwsh: 'bash', read: 'read', web_fetch: 'read', web_search: 'search', grep: 'search', glob: 'search',
  write: 'write', edit: 'edit', run_code: 'code', cordis_package_inspect: 'read', cordis_runtime_inspect: 'read',
  cordis_run: 'others', cordis_stop: 'others', cordis_undefine: 'others',
}

const SUMMARY_KEYS: Readonly<Record<ToolVariant, readonly string[]>> = {
  bash: ['description', 'command'], read: ['path', 'file_path', 'url'], search: ['query', 'pattern', 'url'],
  write: ['path', 'file_path'], edit: ['path', 'file_path'], code: ['description'], others: [],
}

function todosFromTool(name: string, raw: unknown): TodoItem[] | undefined {
  if (!/todo/i.test(name)) return undefined
  const args = parseArgs(raw)
  if (args === undefined) return undefined
  const list = args.todos
  if (!Array.isArray(list)) return undefined
  const todos: TodoItem[] = []
  for (const [index, entry] of list.entries()) {
    if (!isObject(entry) || typeof entry.content !== 'string') continue
    const status = entry.status === 'completed' || entry.status === 'in_progress' ? entry.status : 'pending'
    const id = typeof entry.id === 'string' && entry.id !== '' ? entry.id : 'todo-' + String(index)
    todos.push({ id, content: entry.content, status })
  }
  return todos
}

function goalFromTool(name: string, raw: unknown): GoalItem | undefined {
  if (!/goal/i.test(name)) return undefined
  const args = parseArgs(raw)
  if (args === undefined) return undefined
  const title = typeof args.title === 'string' ? args.title : typeof args.objective === 'string' ? args.objective : undefined
  if (title === undefined) return undefined
  const status = typeof args.status === 'string' ? args.status : typeof args.phase === 'string' ? args.phase : 'active'
  return { title, status }
}

function parseArgs(raw: unknown): Record<string, unknown> | undefined {
  if (typeof raw === 'string') {
    try {
      const parsed: unknown = JSON.parse(raw)
      return isObject(parsed) ? parsed : undefined
    } catch {
      return undefined
    }
  }
  return isObject(raw) ? raw : undefined
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function clip(text: string, max: number): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  return flat.length <= max ? flat : flat.slice(0, max - 1) + '…'
}

