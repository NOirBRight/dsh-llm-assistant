import { describe, expect, it, vi } from 'vitest'

import { AssistantController } from '../src/client/controller.ts'
import { ASSISTANT_ROLLOVER_ENDPOINT, ASSISTANT_SEND_ENDPOINT, ASSISTANT_SNAPSHOT_ENDPOINT, type AssistantSnapshot } from '../src/contract.ts'

const fresh: AssistantSnapshot = {
  sessionId: 'session-new', seq: 0, status: 'idle', messages: [], items: [], pending: '', thinking: '',
  context: { used: 1, cap: 128000, system: 0, tools: 0, messages: 1 }, todos: [], revision: 0,
}

describe('assistant controller rollover seam', () => {
  it('switches through host RPC and immediately publishes the new snapshot', async () => {
    const call = vi.fn(async (_channel: string, endpoint: string) => endpoint === ASSISTANT_ROLLOVER_ENDPOINT
      ? { ok: true as const, value: { sessionId: 'session-new' } }
      : { ok: true as const, value: fresh })
    const controller = new AssistantController({ get: () => ({ rpc: { call } }) } as never)
    const listener = vi.fn()
    controller.subscribe(listener)

    await expect(controller.newConversation()).resolves.toBeUndefined()

    expect(call.mock.calls.map((entry) => entry[1])).toEqual([ASSISTANT_ROLLOVER_ENDPOINT, ASSISTANT_SNAPSHOT_ENDPOINT])
    expect(controller.getSnapshot()?.sessionId).toBe('session-new')
    expect(listener).toHaveBeenCalledOnce()
  })

  it('treats a send reply with sent false as failure', async () => {
    const call = vi.fn(async () => ({ ok: true as const, value: { sent: false, error: 'attachments service is not available' } }))
    const controller = new AssistantController({ get: () => ({ rpc: { call } }) } as never)
    await expect(controller.send('hello')).resolves.toBe(false)
    expect(call.mock.calls.map((entry) => entry[1])).toEqual([ASSISTANT_SEND_ENDPOINT])
  })

  it('treats a thrown RPC as a failed send', async () => {
    const call = vi.fn(async () => { throw new Error('offline') })
    const controller = new AssistantController({ get: () => ({ rpc: { call } }) } as never)
    await expect(controller.send('hello')).resolves.toBe(false)
  })
})
