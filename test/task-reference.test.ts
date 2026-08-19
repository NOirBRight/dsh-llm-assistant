import { describe, expect, it } from 'vitest'

import { createTaskReferenceAdapter } from '../src/task-reference.ts'

const record = (id: string, createdAt: number, extra: { parentSession?: string; origin?: 'subagent' } = {}) => ({
  header: { id, createdAt, ...extra },
  live: true,
  persisted: true,
})

describe('task reference seam', () => {
  it('references the task root plus the two newest non-subagent descendants', async () => {
    const root = record('root', 1)
    const old = record('old', 2, { parentSession: 'root' })
    const recent = record('recent', 3, { parentSession: 'root' })
    const newest = record('newest', 4, { parentSession: 'root' })
    const worker = record('worker', 5, { parentSession: 'root', origin: 'subagent' })
    const preparedReferences: string[][] = []
    const adapter = createTaskReferenceAdapter({
      async traceSession() {
        return {
          target: root,
          ancestors: [],
          descendants: [old, recent, newest, worker].map((session) => ({ session, descendants: [] })),
          complete: true,
          root,
        }
      },
      async readSurface(sessionId) {
        const times: Record<string, number> = { root: 10, old: 20, recent: 30, newest: 40, worker: 50 }
        return { capturedThroughSeq: times[sessionId] ?? null, events: [{ time: times[sessionId] ?? 0 }] }
      },
      async readTitle(sessionId) { return { title: sessionId === 'root' ? '登录修复' : sessionId } },
      async prepare(_agent, content, references) {
        preparedReferences.push(references.map((item) => item.sessionId))
        return { content, additionalContext: { role: 'user', content: [], source: { kind: 'session-reference' } } }
      },
      deniedSessionIds: () => ['assistant', 'duty'],
    })

    const result = await adapter.prepare({
      agent: { id: 'assistant' },
      content: [{ type: 'text', text: '现在做到哪了？' }],
      anchorSessionId: 'root',
    })

    expect(preparedReferences).toEqual([['root', 'newest', 'recent']])
    expect(result.receipt).toMatchObject({
      taskId: 'root',
      label: '登录修复',
      totalSessions: 4,
      omittedSessions: 1,
      sourceSessionIds: ['root', 'newest', 'recent'],
    })
  })

  it('keeps an explicitly selected branch ahead of newer sibling branches', async () => {
    const root = record('root', 1)
    const selected = record('selected', 2, { parentSession: 'root' })
    const newer = record('newer', 3, { parentSession: 'root' })
    const newest = record('newest', 4, { parentSession: 'root' })
    let references: string[] = []
    const adapter = createTaskReferenceAdapter({
      async traceSession() {
        return { target: selected, ancestors: [root], descendants: [
          { session: selected, descendants: [] },
          { session: newer, descendants: [] },
          { session: newest, descendants: [] },
        ], complete: true, root }
      },
      async readSurface(sessionId) { return { capturedThroughSeq: 1, events: [{ time: { selected: 5, newer: 20, newest: 30 }[sessionId] ?? 0 }] } },
      async readTitle() { return { title: '任务' } },
      async prepare(_agent, content, input) { references = input.map((item) => item.sessionId); return { content } },
      deniedSessionIds: () => [],
    })

    await adapter.prepare({ agent: {}, content: [], anchorSessionId: 'selected' })

    expect(references).toEqual(['root', 'selected', 'newest'])
  })
})
