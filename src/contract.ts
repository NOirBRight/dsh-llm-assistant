/**
 * Host/client RPC contract for the resident assistant seat (T1.2).
 *
 * The assistant session is owned by the host plugin (one session, id persisted
 * since T1.1), so requests carry no sessionId — the host resolves its own
 * assistant. Transport is the Connection generic RPC: the client POSTs
 * `{type:'client-request', rpcId, method, payload}` to `/{channel}/{endpoint}`
 * and the host replies with `{type:'server-response', rpcId, result}`.
 */

export const ASSISTANT_RPC_CHANNEL = '/llm-assistant'
export const ASSISTANT_SNAPSHOT_ENDPOINT = 'assistant/snapshot'
export const ASSISTANT_SEND_ENDPOINT = 'assistant/send'
export const ASSISTANT_SET_MODEL_ENDPOINT = 'assistant/set-model'
export const ASSISTANT_IMAGE_ENDPOINT = 'assistant/image'
export const ASSISTANT_ROLLOVER_ENDPOINT = 'assistant/rollover'

/** One display message in the assistant conversation (AC-CHAT-1). */
export interface ChatMessage {
  /** Session event seq — ordering key. */
  readonly seq: number
  readonly role: 'user' | 'assistant'
  readonly text: string
  /** MessageSource label: 'user', or 'plugin:schedule' for reminder turns. */
  readonly source: string
  readonly time: number
}

/** User bubble — right-aligned, matches the main conversation User_Bubble. */
export interface UserItem {
  readonly kind: 'user'
  readonly seq: number
  readonly text: string
  readonly time: number
  readonly source: string
  readonly images?: readonly ChatImageRef[]
}

/** Assistant narration — full-width markdown, not a bubble. */
export interface AssistantItem {
  readonly kind: 'assistant'
  readonly seq: number
  readonly text: string
  readonly time: number
}

/** Tool summary row — same 24px step-summary as the main agent. */
export interface ToolItem {
  readonly kind: 'tool'
  readonly seq: number
  readonly name: string
  readonly status: 'running' | 'done' | 'error'
  readonly summary: string
}

/** Model / request failure — shown in-place so a silent turn is not mistaken for hang. */
export interface ErrorItem {
  readonly kind: 'error'
  readonly seq: number
  readonly text: string
}

export interface TaskReferenceReceipt {
  readonly taskId: string
  readonly label: string
  readonly totalSessions: number
  readonly omittedSessions: number
  readonly sourceSessionIds: readonly string[]
}

export interface TaskReferenceItem {
  readonly kind: 'task-reference'
  readonly seq: number
  readonly receipt: TaskReferenceReceipt
}

export type TimelineItem = UserItem | AssistantItem | ToolItem | ErrorItem | TaskReferenceItem

export interface ChatImageRef {
  readonly attachmentId: string
  readonly mediaType: string
  readonly name?: string
}

export interface TodoItem {
  readonly id: string
  readonly content: string
  readonly status: 'pending' | 'in_progress' | 'completed'
}

export interface GoalItem {
  readonly title: string
  readonly status: string
}

export interface ModelEffort {
  readonly id: string
  readonly name: string
}

export interface ModelOption {
  readonly id: string
  readonly label: string
  readonly provider: string
  readonly efforts?: readonly ModelEffort[]
}

export interface ModelGroup {
  readonly id: string
  readonly name: string
  readonly models: readonly ModelOption[]
}

export interface ModelChrome {
  readonly provider: string
  readonly model: string
  readonly effort?: string
  readonly effortLabel?: string
  readonly options?: readonly ModelOption[]
  readonly groups?: readonly ModelGroup[]
  readonly efforts?: readonly ModelEffort[]
}

export interface ContextChrome {
  readonly used: number
  readonly cap: number
  readonly system: number
  readonly tools: number
  readonly messages: number
}

/**
 * Live projection of the assistant session served by the host. History comes
 * from the durable session log, so a page refresh re-fetches the same history
 * (AC-CHAT-5). `pending` carries the in-progress assistant text while a turn
 * streams (AC-CHAT-2); `status` + `currentTool` drive the state indicator
 * (AC-CHAT-3).
 */
export interface AssistantSnapshot {
  readonly sessionId: string
  readonly seq: number
  readonly status: 'idle' | 'running'
  readonly messages: readonly AssistantMessage[]
  readonly items: readonly TimelineItem[]
  readonly pending?: string
  readonly thinking?: string
  readonly currentTool?: string
  readonly model?: ModelChrome
  readonly context?: ContextChrome
  readonly todos?: readonly TodoItem[]
  readonly goal?: GoalItem
  readonly taskReferenceAvailable?: boolean
  /** Monotonic counter bumped on every assistant-session event. */
  readonly revision: number
}

/** Ordered projection of one assistant/user message. */
export interface AssistantMessage {
  readonly seq: number
  readonly role: 'user' | 'assistant'
  readonly text: string
  readonly source: string
  readonly time: number
}

export interface SendImage {
  readonly name: string
  readonly mediaType: string
  readonly dataBase64: string
}

export interface TaskAnchor {
  readonly sessionId: string
  readonly label?: string
}

export interface SendRequest {
  readonly text: string
  readonly images?: readonly SendImage[]
  /** Invisible current-page task anchor available to the assistant's task_reference tool. */
  readonly currentTask?: TaskAnchor
}

export interface SetModelRequest {
  readonly model: string
  readonly provider?: string
  readonly effort?: string
}

export type SendReply =
  | { readonly sent: true }
  | { readonly sent: false; readonly error: string }

/** Wire RPC result, aligned with the Connection transport's RpcResult shape. */
export type RpcResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: { readonly code: string; readonly message: string } }

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function decodeSendRequest(payload: unknown): SendRequest | undefined {
  if (!isRecord(payload)) return undefined
  if (typeof payload.text !== 'string') return undefined
  const text = payload.text
  const images = decodeSendImages(payload.images)
  if (text.trim() === '' && images.length === 0) return undefined
  const currentTask = decodeTaskAnchor(payload.currentTask)
  if (payload.currentTask !== undefined && currentTask === undefined) return undefined
  return {
    text,
    ...(images.length === 0 ? {} : { images }),
    ...(currentTask === undefined ? {} : { currentTask }),
  }
}

function decodeTaskAnchor(value: unknown): TaskAnchor | undefined {
  if (!isRecord(value) || typeof value.sessionId !== 'string' || value.sessionId.trim() === '') return undefined
  if (value.label !== undefined && typeof value.label !== 'string') return undefined
  return { sessionId: value.sessionId, ...(typeof value.label === 'string' && value.label.trim() !== '' ? { label: value.label } : {}) }
}

export function decodeImageRequest(payload: unknown): { attachmentId: string } | undefined {
  if (!isRecord(payload)) return undefined
  if (typeof payload.attachmentId !== 'string' || payload.attachmentId.trim() === '') return undefined
  return { attachmentId: payload.attachmentId }
}

export function decodeSetModelRequest(payload: unknown): SetModelRequest | undefined {
  if (!isRecord(payload)) return undefined
  if (typeof payload.model !== 'string' || payload.model.trim() === '') return undefined
  return {
    model: payload.model,
    ...(typeof payload.provider === 'string' && payload.provider.trim() !== '' ? { provider: payload.provider } : {}),
    ...(typeof payload.effort === 'string' && payload.effort.trim() !== '' ? { effort: payload.effort } : {}),
  }
}

function decodeSendImages(value: unknown): SendImage[] {
  if (!Array.isArray(value)) return []
  const images: SendImage[] = []
  for (const entry of value) {
    if (!isRecord(entry)) continue
    if (typeof entry.name !== 'string' || entry.name.trim() === '') continue
    if (typeof entry.mediaType !== 'string' || !entry.mediaType.startsWith('image/')) continue
    if (typeof entry.dataBase64 !== 'string' || entry.dataBase64.length === 0) continue
    images.push({ name: entry.name, mediaType: entry.mediaType, dataBase64: entry.dataBase64 })
  }
  return images
}
