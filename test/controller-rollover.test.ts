import { describe, expect, it, vi } from 'vitest'

import { AssistantController } from '../src/client/controller.ts'
import { ASSISTANT_ROLLOVER_ENDPOINT, ASSISTANT_SNAPSHOT_ENDPOINT, type AssistantSnapshot } from '../src/contract.ts'

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
})
