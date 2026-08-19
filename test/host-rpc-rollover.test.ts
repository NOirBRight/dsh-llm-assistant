import { describe, expect, it, vi } from 'vitest'

import { ASSISTANT_ROLLOVER_ENDPOINT } from '../src/contract.ts'
import { handleAssistantRpc } from '../src/host-rpc.ts'
import type { AssistantPort } from '../src/assistant-port.ts'

const port = {
  snapshot: () => { throw new Error('unused') },
  send: async () => ({ sent: true as const }),
  readImage: async () => undefined,
  sessionHasImages: () => false,
} satisfies AssistantPort

describe('assistant rollover RPC seam', () => {
  it('creates only the current assistant successor through the host extra', async () => {
    const rollover = vi.fn(async () => ({ ok: true as const, value: { sessionId: 'session-new' } }))

    await expect(handleAssistantRpc(port, ASSISTANT_ROLLOVER_ENDPOINT, {}, { rollover })).resolves.toEqual({
      ok: true,
      value: { sessionId: 'session-new' },
    })
    expect(rollover).toHaveBeenCalledOnce()
  })

  it('rejects a rollover payload that names a sessionId', async () => {
    const rollover = vi.fn(async () => ({ ok: true as const, value: { sessionId: 'session-new' } }))
    await expect(handleAssistantRpc(port, ASSISTANT_ROLLOVER_ENDPOINT, { sessionId: 'session-other' }, { rollover })).resolves.toEqual({
      ok: false,
      error: { code: 'bad-request', message: 'invalid assistant/rollover request' },
    })
    expect(rollover).not.toHaveBeenCalled()
  })
})
