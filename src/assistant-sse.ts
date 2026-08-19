import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'
import { ASSISTANT_EVENTS_ENDPOINT } from './contract.ts'
import type { AssistantPort } from './assistant-port.ts'
import {
  applyAssistantLiveDelta,
  diffAssistantSnapshot,
  type AssistantLiveDelta,
  type AssistantStreamFrame,
} from './snapshot-patch.ts'

interface WebServerService {
  register(route: {
    kind: 'exact'
    path: string
    handler(req: IncomingMessage, res: ServerResponse): void
  }): () => void
}

interface SessionEventView {
  readonly type: string
  readonly seq: number
  readonly data: Record<string, unknown>
}

export function registerAssistantSse(
  ctx: Context,
  port: AssistantPort,
  currentSessionId: () => string,
): void {
  const webServer = ctx.get('webServer') as WebServerService | undefined
  if (webServer === undefined) return

  const connections = new Set<ServerResponse>()
  let current = port.snapshot()

  const send = (response: ServerResponse, frame: AssistantStreamFrame): void => {
    response.write(`data: ${JSON.stringify(frame)}\n\n`)
  }
  const broadcast = (frame: AssistantStreamFrame): void => {
    for (const response of connections) send(response, frame)
  }

  ctx.effect(() => {
    const disposeRoute = webServer.register({
      kind: 'exact',
      path: ASSISTANT_EVENTS_ENDPOINT,
      handler(req, res) {
        if (req.method !== 'GET') {
          res.writeHead(405)
          res.end()
          return
        }
        res.writeHead(200, {
          'content-type': 'text/event-stream',
          'cache-control': 'no-cache',
          'connection': 'keep-alive',
          'x-accel-buffering': 'no',
        })
        res.write(': connected\n\n')
        current = port.snapshot()
        send(res, { type: 'snapshot', snapshot: current })
        connections.add(res)
        res.on('close', () => { connections.delete(res) })
      },
    })
    return () => {
      disposeRoute()
      for (const response of connections) response.destroy()
      connections.clear()
    }
  }, 'dsh-llm-assistant: SSE stream')

  const on = ctx.on.bind(ctx) as unknown as (
    name: string,
    listener: (session: { readonly id: string }, event: SessionEventView) => void,
  ) => unknown
  on('session/event', (session, event) => {
    if (session.id !== currentSessionId()) return
    if (current.sessionId !== session.id) {
      current = port.snapshot()
      broadcast({ type: 'snapshot', snapshot: current })
      return
    }
    const delta = liveDeltaOf(event)
    if (delta !== undefined) {
      const revision = Math.max(current.revision + 1, event.seq)
      current = applyAssistantLiveDelta(current, delta, event.seq, revision)
      broadcast({ type: 'delta', seq: event.seq, revision, delta })
      return
    }
    const projected = port.snapshot()
    const next = projected.revision > current.revision ? projected : { ...projected, revision: current.revision + 1 }
    const patch = diffAssistantSnapshot(current, next)
    current = next
    if (Object.keys(patch).length > 0) broadcast({ type: 'patch', patch })
  })
}

function liveDeltaOf(event: SessionEventView): AssistantLiveDelta | undefined {
  if (event.type !== 'assistant/chunk') return undefined
  const chunk = event.data.chunk
  if (!isObject(chunk)) return undefined
  if (chunk.type === 'text-delta' && typeof chunk.text === 'string') return { kind: 'text', text: chunk.text }
  if (chunk.type === 'reasoning-delta' && typeof chunk.text === 'string') return { kind: 'reasoning', text: chunk.text }
  if (chunk.type === 'tool-call-delta' && typeof chunk.name === 'string') return { kind: 'tool', name: chunk.name }
  return undefined
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
