import { describe, expect, it, vi } from 'vitest'

import { AssistantController } from '../src/client/controller.ts'
import { ASSISTANT_SEND_ENDPOINT, ASSISTANT_SNAPSHOT_ENDPOINT, type AssistantSnapshot } from '../src/contract.ts'
import { handleAssistantRpc } from '../src/host-rpc.ts'
import type { AssistantPort } from '../src/assistant-port.ts'

const snapshot: AssistantSnapshot = {
  sessionId: 'assistant', seq: 0, status: 'idle', messages: [], items: [], pending: '', thinking: '',
  context: { used: 1, cap: 128000, system: 0, tools: 0, messages: 1 }, todos: [], revision: 0,
}

describe('assistant current-task context seam', () => {
  it('sends the current page task invisibly instead of an explicit reference option', async () => {
    const call = vi.fn(async (_channel: string, endpoint: string) => endpoint === ASSISTANT_SEND_ENDPOINT
      ? { ok: true as const, value: { sent: true } }
      : { ok: true as const, value: snapshot })
    const controller = new AssistantController({ get: () => ({ rpc: { call } }) } as never)

    await expect(controller.send('进展？', undefined, { sessionId: 'task-a', label: '任务 A' })).resolves.toBe(true)

    expect(call.mock.calls[0]?.[2]).toEqual({ text: '进展？', currentTask: { sessionId: 'task-a', label: '任务 A' } })
    expect(call.mock.calls.map((entry) => entry[1])).toEqual([ASSISTANT_SEND_ENDPOINT, ASSISTANT_SNAPSHOT_ENDPOINT])
  })

  it('updates tool context before the user turn starts', async () => {
    const effects: string[] = []
    const port = {
      snapshot: () => snapshot,
      send: async () => { effects.push('send'); return { sent: true as const } },
      readImage: async () => undefined,
      sessionHasImages: () => false,
    } satisfies AssistantPort

    await handleAssistantRpc(port, ASSISTANT_SEND_ENDPOINT, { text: '进展？', currentTask: { sessionId: 'task-a', label: '任务 A' } }, {
      noteCurrentTask(task) { effects.push('anchor:' + task?.sessionId) },
    })

    expect(effects).toEqual(['anchor:task-a', 'send'])
  })
})
