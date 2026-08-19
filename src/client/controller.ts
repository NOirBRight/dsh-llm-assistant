/**
 * Browser-side assistant store: host RPC (snapshot/send) + live snapshot state.
 *
 * The host owns the assistant session; the panel only talks to it over the
 * Connection generic RPC channel. While a turn streams the controller consumes
 * token-level SSE frames with snapshot polling only as a reconnect fallback (AC-CHAT-2/3); closing the panel does not touch
 * the running turn, and reopening re-fetches the current state (AC-CHAT-4).
 * History always comes from the host's projection of the session log, so a
 * page refresh shows the same history (AC-CHAT-5).
 */

import type { ConnectionHandle } from '@deepseek-ai/dsh-client-connection/client'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import {
  ASSISTANT_EVENTS_ENDPOINT,
  ASSISTANT_IMAGE_ENDPOINT,
  ASSISTANT_RPC_CHANNEL,
  ASSISTANT_ROLLOVER_ENDPOINT,
  ASSISTANT_SEND_ENDPOINT,
  ASSISTANT_SET_MODEL_ENDPOINT,
  ASSISTANT_SNAPSHOT_ENDPOINT,
  type AssistantSnapshot,
  type TaskAnchor,
} from '../contract.ts'
import { applyAssistantStreamFrame, type AssistantStreamFrame } from '../snapshot-patch.ts'

const POLL_INTERVAL_MS = 500
const IDLE_POLL_INTERVAL_MS = 4000

export class AssistantController {
  readonly #rpc: ConnectionHandle['rpc']
  #snapshot: AssistantSnapshot | undefined
  #listeners = new Set<() => void>()
  #pollTimer: ReturnType<typeof setInterval> | undefined
  #pollMs = IDLE_POLL_INTERVAL_MS
  #watching = false
  #fetching = false
  #fetchEpoch = 0
  #stream: EventSource | undefined
  #streamOpen = false

  constructor(ctx: ClientContext) {
    this.#rpc = (ctx.get('connection') as ConnectionHandle).rpc
  }

  readonly getSnapshot = (): AssistantSnapshot | undefined => this.#snapshot

  readonly subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener)
    return () => {
      this.#listeners.delete(listener)
    }
  }

  /** Overlay mounted: keep a slow snapshot so the unread mark can move while the panel is closed. */
  watch(): void {
    this.#watching = true
    this.#startStream()
    this.#setPoll(IDLE_POLL_INTERVAL_MS)
    void this.#fetch()
  }

  /** Overlay unmounted. */
  unwatch(): void {
    this.#watching = false
    this.#stopStream()
    this.#stopPolling()
  }

  /** Panel opened: load current state, then poll while the assistant is busy. */
  async open(): Promise<void> {
    await this.#fetch()
    if (this.#snapshot?.status === 'running' && !this.#streamOpen) this.#setPoll(POLL_INTERVAL_MS)
    else this.#setPoll(IDLE_POLL_INTERVAL_MS)
  }

  /** Panel closed: drop to the idle poll. The host keeps running the turn (AC-CHAT-4). */
  close(): void {
    this.#setPoll(IDLE_POLL_INTERVAL_MS)
  }

  /** Drive one user message (and optional images) into the assistant session. */
  async send(text: string, images?: readonly { name: string; mediaType: string; dataBase64: string }[], currentTask?: TaskAnchor): Promise<boolean> {
    const trimmed = text.trim()
    if (trimmed.length === 0 && (images === undefined || images.length === 0)) return false
    const payload = {
      text: trimmed,
      ...(images !== undefined && images.length > 0 ? { images } : {}),
      ...(currentTask === undefined ? {} : { currentTask }),
    }
    try {
      const result = await this.#rpc.call(ASSISTANT_RPC_CHANNEL, ASSISTANT_SEND_ENDPOINT, payload)
      if (!result.ok) return false
      const value = result.value as { sent?: unknown }
      if (value.sent !== true) return false
      this.#setPoll(this.#streamOpen ? IDLE_POLL_INTERVAL_MS : POLL_INTERVAL_MS)
      await this.#fetch()
      return true
    } catch {
      return false
    }
  }

  async readImage(attachmentId: string): Promise<{ mediaType: string; dataBase64: string } | undefined> {
    const result = await this.#rpc.call(ASSISTANT_RPC_CHANNEL, ASSISTANT_IMAGE_ENDPOINT, { attachmentId })
    if (!result.ok) return undefined
    return result.value as { mediaType: string; dataBase64: string }
  }

  async newConversation(): Promise<string | undefined> {
    let result: { ok: true; value: unknown } | { ok: false; error: { message: string } }
    try {
      result = await this.#rpc.call(ASSISTANT_RPC_CHANNEL, ASSISTANT_ROLLOVER_ENDPOINT, {}) as typeof result
    } catch (error) {
      return error instanceof Error ? error.message : String(error)
    }
    if (!result.ok) return result.error.message
    const value = result.value as { sessionId?: unknown }
    const next = await this.#fetch(true)
    if (typeof value.sessionId !== 'string' || next?.sessionId !== value.sessionId) return '新对话已创建，但席位快照刷新失败'
    return undefined
  }

  async setModel(model: string, effort?: string, provider?: string): Promise<string | undefined> {
    if (model.trim() === '') return 'empty model'
    try {
      const result = await this.#rpc.call(
        ASSISTANT_RPC_CHANNEL,
        ASSISTANT_SET_MODEL_ENDPOINT,
        {
          model,
          ...(effort !== undefined ? { effort } : {}),
          ...(provider !== undefined ? { provider } : {}),
        },
      )
      if (!result.ok) return result.error.message
      await this.#fetch()
      return undefined
    } catch (error) {
      return error instanceof Error ? error.message : String(error)
    }
  }

  #startStream(): void {
    if (this.#stream !== undefined) return
    const stream = new EventSource(ASSISTANT_EVENTS_ENDPOINT)
    this.#stream = stream
    stream.onopen = () => {
      this.#streamOpen = true
      this.#setPoll(IDLE_POLL_INTERVAL_MS)
    }
    stream.onerror = () => {
      this.#streamOpen = false
      if (this.#snapshot?.status === 'running') this.#setPoll(POLL_INTERVAL_MS)
    }
    stream.onmessage = (event) => {
      try {
        const frame = JSON.parse(event.data) as AssistantStreamFrame
        if (!isAssistantStreamFrame(frame)) return
        const next = applyAssistantStreamFrame(this.#snapshot, frame)
        if (next === undefined) return
        this.#snapshot = next
        for (const listener of this.#listeners) listener()
      } catch {
        // Ignore one malformed frame; EventSource keeps the ordered stream alive.
      }
    }
  }

  #stopStream(): void {
    this.#stream?.close()
    this.#stream = undefined
    this.#streamOpen = false
  }

  #setPoll(ms: number): void {
    if (this.#pollTimer !== undefined && this.#pollMs === ms) return
    this.#stopPolling()
    this.#pollMs = ms
    this.#pollTimer = setInterval(() => {
      void this.#fetch().then((snapshot) => {
        if (snapshot?.status === 'idle' && this.#watching) this.#setPoll(IDLE_POLL_INTERVAL_MS)
        else if (snapshot?.status === 'running') this.#setPoll(this.#streamOpen ? IDLE_POLL_INTERVAL_MS : POLL_INTERVAL_MS)
      })
    }, ms)
  }

  #stopPolling(): void {
    if (this.#pollTimer !== undefined) {
      clearInterval(this.#pollTimer)
      this.#pollTimer = undefined
    }
  }

  async #fetch(force = false): Promise<AssistantSnapshot | undefined> {
    if (this.#fetching && !force) return this.#snapshot
    const epoch = ++this.#fetchEpoch
    this.#fetching = true
    try {
      const result = await this.#rpc.call(ASSISTANT_RPC_CHANNEL, ASSISTANT_SNAPSHOT_ENDPOINT, {})
      if (!result.ok) return this.#snapshot
      const snapshot = result.value as AssistantSnapshot
      if (epoch !== this.#fetchEpoch) return this.#snapshot
      this.#snapshot = snapshot
      for (const listener of this.#listeners) listener()
      return snapshot
    } catch {
      return this.#snapshot
    } finally {
      if (epoch === this.#fetchEpoch) this.#fetching = false
    }
  }
}

function isAssistantStreamFrame(value: unknown): value is AssistantStreamFrame {
  if (typeof value !== 'object' || value === null || !('type' in value)) return false
  const frame = value as { readonly type?: unknown; readonly snapshot?: unknown; readonly patch?: unknown; readonly delta?: unknown }
  if (frame.type === 'snapshot') return typeof frame.snapshot === 'object' && frame.snapshot !== null
  if (frame.type === 'patch') return typeof frame.patch === 'object' && frame.patch !== null
  return frame.type === 'delta' && typeof frame.delta === 'object' && frame.delta !== null
}
