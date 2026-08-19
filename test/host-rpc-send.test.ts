import { describe, expect, it } from 'vitest'

import { ASSISTANT_SEND_ENDPOINT } from '../src/contract.ts'
import { handleAssistantRpc } from '../src/host-rpc.ts'
import type { AssistantPort } from '../src/assistant-port.ts'

function port(send: AssistantPort['send']): AssistantPort {
  return {
    snapshot: () => { throw new Error('unused') },
    send,
    readImage: async () => undefined,
    sessionHasImages: () => false,
  }
}

describe('assistant send RPC seam', () => {
  it('maps a failed port send to an RPC error so the seat keeps the draft', async () => {
    const result = await handleAssistantRpc(
      port(async () => ({ sent: false, error: 'attachments service is not available' })),
      ASSISTANT_SEND_ENDPOINT,
      { text: 'hello' },
    )
    expect(result).toEqual({
      ok: false,
      error: { code: 'send-failed', message: 'attachments service is not available' },
    })
  })

  it('returns the send reply when the port accepts the message', async () => {
    const result = await handleAssistantRpc(
      port(async () => ({ sent: true })),
      ASSISTANT_SEND_ENDPOINT,
      { text: 'hello' },
    )
    expect(result).toEqual({ ok: true, value: { sent: true } })
  })
})
