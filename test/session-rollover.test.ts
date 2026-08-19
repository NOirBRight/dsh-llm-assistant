import { describe, expect, it } from 'vitest'

import { buildSessionHandoff, createSessionRollover, type RolloverAgent, type RolloverAgentHandle } from '../src/session-rollover.ts'
import type { AssistantSnapshot } from '../src/contract.ts'

function snapshot(overrides: Partial<AssistantSnapshot> = {}): AssistantSnapshot {
  return {
    sessionId: 'session-old',
    seq: 9,
    status: 'idle',
    messages: [],
    items: [],
    pending: '',
    thinking: '',
    context: { used: 90000, cap: 100000, system: 1000, tools: 2000, messages: 87000 },
    todos: [],
    revision: 1,
    ...overrides,
  }
}

describe('session rollover handoff seam', () => {
  it('carries only active work and necessary paths in a bounded handoff', () => {
    const text = buildSessionHandoff(snapshot({
      goal: { title: '发布 /srv/app 到测试环境', status: 'active' },
      todos: [
        { id: '1', content: '检查 /srv/app/config.yml', status: 'in_progress' },
        { id: '2', content: '清理 /tmp/old.log', status: 'completed' },
      ],
      messages: [
        { seq: 1, role: 'user', text: '整本 transcript 不要带过去', source: 'user', time: 1 },
        { seq: 2, role: 'assistant', text: '已处理 /srv/app/config.yml', source: 'model', time: 2 },
      ],
    }))

    expect(text).toContain('当前目标：发布 /srv/app 到测试环境')
    expect(text).toContain('检查 /srv/app/config.yml')
    expect(text).not.toContain('清理 /tmp/old.log')
    expect(text).toContain('/srv/app')
    expect(text).toContain('/srv/app/config.yml')
    expect(text).not.toContain('整本 transcript 不要带过去')
    expect(Buffer.byteLength(text, 'utf8')).toBeLessThanOrEqual(4096)
  })

  it('does not pair an unanswered latest request with an older assistant conclusion', () => {
    const text = buildSessionHandoff(snapshot({ messages: [
      { seq: 1, role: 'assistant', text: '旧结论，不应带走', source: 'model', time: 1 },
      { seq: 2, role: 'user', text: '最新请求还没回答', source: 'user', time: 2 },
    ] }))

    expect(text).toContain('当前焦点：最新请求还没回答')
    expect(text).not.toContain('旧结论，不应带走')
  })

  it('uses a short current-focus fallback when no structured work exists', () => {
    const text = buildSessionHandoff(snapshot({ messages: [
      { seq: 1, role: 'user', text: '继续排查连接问题', source: 'user', time: 1 },
      { seq: 2, role: 'assistant', text: '下一步检查代理配置', source: 'model', time: 2 },
    ] }))

    expect(text).toContain('当前焦点：继续排查连接问题')
    expect(text).toContain('上次结论：下一步检查代理配置')
  })
})

describe('session rollover orchestration seam', () => {
  it('durably seeds the new session before switching and retiring the old one', async () => {
    const order: string[] = []
    const makeAgent = (id: string): RolloverAgent => ({
      id,
      status: 'idle',
      session: { id, events: [], header: {}, append: () => {} },
      inject: () => { order.push('seed-new') },
      runMaintenance: async <T>(task: () => Promise<T>): Promise<T> => {
        order.push(id + '-maintenance:start')
        try { return await task() } finally { order.push(id + '-maintenance:end') }
      },
    })
    const oldHandle: RolloverAgentHandle = { agent: makeAgent('session-old'), dispose: async () => { order.push('dispose-old') } }
    const newHandle: RolloverAgentHandle = { agent: makeAgent('session-new'), dispose: async () => { order.push('dispose-new') } }
    let current = oldHandle
    const rollover = createSessionRollover({
      current: () => ({ handle: current, snapshot: snapshot(), model: { provider: 'p', model: 'm' }, archivedSessionIds: [] }),
      newSessionId: () => 'session-new',
      create: async () => { order.push('create-new'); return newHandle },
      handoffMessage: (text) => ({ text }),
      captureSchedules: () => [{ id: 'schedule-1' }],
      restoreSchedules: () => { order.push('restore-new') },
      retireSchedules: () => { order.push('retire-old') },
      flush: async (agent) => { order.push('flush-' + (agent.id === 'session-new' ? 'new' : 'old')) },
      commit: (next) => { order.push('commit'); current = next.handle },
      warn: () => {},
    })

    await expect(rollover.rollover()).resolves.toEqual({ sessionId: 'session-new' })
    expect(order).toEqual([
      'session-old-maintenance:start',
      'create-new',
      'session-new-maintenance:start',
      'seed-new',
      'restore-new',
      'flush-new',
      'commit',
      'retire-old',
      'flush-old',
      'session-new-maintenance:end',
      'session-old-maintenance:end',
      'dispose-old',
    ])
  })
})
