import { describe, expect, it } from 'vitest'

import { createAssistantPort, type AssistantAgentView } from '../src/assistant-port.ts'

describe('assistant task-reference port seam', () => {
  it('injects one prepared snapshot and reuses it for task follow-ups', async () => {
    const effects: string[] = []
    const events: Array<{ type: string; seq: number; time: number; data: Record<string, unknown> }> = []
    const agent: AssistantAgentView = {
      id: 'assistant',
      status: 'idle',
      session: {
        id: 'assistant', seq: 0, header: {}, events,
        append(type, data) {
          effects.push('append')
          events.push({ type, seq: events.length + 1, time: 1, data: data as Record<string, unknown> })
        },
      },
      inject(message) {
        effects.push('inject')
        const value = message as { source?: { kind?: string; plugin?: string }; content?: unknown[] }
        if (value.source?.kind === 'plugin' && value.source.plugin === 'dsh-llm-assistant:task-reference') {
          events.push({ type: 'user/message', seq: events.length + 1, time: 1, data: value as Record<string, unknown> })
        }
      },
      followup() { effects.push('followup') },
      async runMaintenance(task) { return task() },
    }
    let prepareCount = 0
    const receipt = { taskId: 'task-a', label: '任务 A', totalSessions: 1, omittedSessions: 0, sourceSessionIds: ['task-a'] }
    const port = createAssistantPort(
      agent,
      { SessionId: (id) => id, createUserMessage: (input) => input },
      () => 0,
      () => ({}),
      undefined,
      { async prepare({ content }) { prepareCount += 1; return { content, additionalContext: { context: true }, receipt } } },
    )

    const first = await port.send('进展？', undefined, { anchor: { sessionId: 'task-a' }, refresh: true })
    const second = await port.send('下一步？', undefined, { anchor: { sessionId: 'task-a' } })

    expect(first).toEqual({ sent: true, task: receipt })
    expect(second).toEqual({ sent: true, task: receipt })
    expect(prepareCount).toBe(1)
    expect(effects).toEqual(['inject', 'inject', 'followup', 'followup'])
    expect(events.every((event) => event.type !== 'assistant/task-reference')).toBe(true)
    expect(port.snapshot().items).toContainEqual({ kind: 'task-reference', seq: 1, receipt })
  })
})
