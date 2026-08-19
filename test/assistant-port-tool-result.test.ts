import { describe, expect, it } from 'vitest'

import { createAssistantPort, type AssistantAgentView, type AssistantRuntimeApi } from '../src/assistant-port.ts'

describe('assistant tool timeline projection', () => {
  it('correlates the runtime nested tool/result envelope', () => {
    const agent = {
      id: 'assistant',
      status: 'idle',
      session: {
        id: 'assistant', seq: 2, header: {},
        events: [
          { type: 'tool/call', seq: 1, time: 1, data: { callId: 'call-1', name: 'task_reference', arguments: '{}' } },
          { type: 'tool/result', seq: 2, time: 2, data: { message: { source: { kind: 'tool', callId: 'call-1' }, content: [{ type: 'tool-result', toolCallId: 'call-1', content: [{ type: 'text', text: 'context' }], isError: false }] } } },
        ],
        append: () => undefined,
      },
      followup: () => undefined, inject: () => undefined, runMaintenance: async (task) => task(),
    } satisfies AssistantAgentView
    const api = { SessionId: (id: string) => id, createUserMessage: (input: unknown) => input } satisfies AssistantRuntimeApi

    const tool = createAssistantPort(agent, api, () => 0).snapshot().items.find((item) => item.kind === 'tool')

    expect(tool).toMatchObject({ kind: 'tool', name: 'task_reference', status: 'done', summary: '{}' })
  })

  it('projects the currently open turn start time and clears it after turn end', () => {
    const events = [
      { type: 'turn/start', seq: 1, time: 1_000, data: {} },
      { type: 'step/start', seq: 2, time: 1_500, data: {} },
    ]
    const agent = {
      id: 'assistant', status: 'running',
      session: { id: 'assistant', seq: 2, header: {}, events, append: () => undefined },
      followup: () => undefined, inject: () => undefined, runMaintenance: async (task: () => Promise<unknown>) => task(),
    } satisfies AssistantAgentView
    const api = { SessionId: (id: string) => id, createUserMessage: (input: unknown) => input } satisfies AssistantRuntimeApi

    expect(createAssistantPort(agent, api, () => 0).snapshot().turnStartTime).toBe(1_000)
    events.push({ type: 'turn/end', seq: 3, time: 2_000, data: {} })
    expect(createAssistantPort({ ...agent, status: 'idle' }, api, () => 0).snapshot().turnStartTime).toBeUndefined()
  })
  it('projects an unfinished tool as stopped when its turn ends', () => {
    const agent = {
      id: 'assistant', status: 'idle',
      session: {
        id: 'assistant', seq: 2, header: {},
        events: [
          { type: 'tool/call', seq: 1, time: 1_000, data: { callId: 'call-1', name: 'task_reference', arguments: '{}' } },
          { type: 'turn/end', seq: 2, time: 2_000, data: { reason: { kind: 'interrupted' } } },
        ],
        append: () => undefined,
      },
      followup: () => undefined, inject: () => undefined, runMaintenance: async (task: () => Promise<unknown>) => task(),
    } satisfies AssistantAgentView
    const api = { SessionId: (id: string) => id, createUserMessage: (input: unknown) => input } satisfies AssistantRuntimeApi

    expect(createAssistantPort(agent, api, () => 0).snapshot().items).toContainEqual(expect.objectContaining({ kind: 'tool', status: 'stopped' }))
  })

  it('projects schedule, duty, and handoff plugin messages instead of dropping them', () => {
    const agent = {
      id: 'assistant', status: 'idle',
      session: {
        id: 'assistant', seq: 3, header: {},
        events: [
          { type: 'user/message', seq: 1, time: 1, data: { source: { kind: 'plugin', plugin: 'schedule' }, content: [{ type: 'text', text: '该喝水了' }] } },
          { type: 'user/message', seq: 2, time: 2, data: { source: { kind: 'plugin', plugin: 'dsh-llm-assistant-duty' }, content: [{ type: 'text', text: '有卡住的待办' }] } },
          { type: 'user/message', seq: 3, time: 3, data: { source: { kind: 'plugin', plugin: 'dsh-llm-assistant' }, content: [{ type: 'text', text: '【助理会话交接】' }] } },
        ],
        append: () => undefined,
      },
      followup: () => undefined, inject: () => undefined, runMaintenance: async (task: () => Promise<unknown>) => task(),
    } satisfies AssistantAgentView
    const api = { SessionId: (id: string) => id, createUserMessage: (input: unknown) => input } satisfies AssistantRuntimeApi
    const items = createAssistantPort(agent, api, () => 0).snapshot().items
    expect(items).toEqual([
      expect.objectContaining({ kind: 'plugin', plugin: 'schedule', text: '该喝水了' }),
      expect.objectContaining({ kind: 'plugin', plugin: 'dsh-llm-assistant-duty', text: '有卡住的待办' }),
      expect.objectContaining({ kind: 'plugin', plugin: 'dsh-llm-assistant', text: '【助理会话交接】' }),
    ])
  })

  it('overlays the model context window onto the projected meter', () => {
    const agent = {
      id: 'assistant', status: 'idle',
      session: { id: 'assistant', seq: 0, header: {}, events: [], append: () => undefined },
      followup: () => undefined, inject: () => undefined, runMaintenance: async (task: () => Promise<unknown>) => task(),
    } satisfies AssistantAgentView
    const api = { SessionId: (id: string) => id, createUserMessage: (input: unknown) => input } satisfies AssistantRuntimeApi
    const snapshot = createAssistantPort(agent, api, () => 0, () => ({ contextCap: 64_000 })).snapshot()
    expect(snapshot.context?.cap).toBe(64_000)
  })
})
