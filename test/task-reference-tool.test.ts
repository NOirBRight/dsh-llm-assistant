import { describe, expect, it } from 'vitest'

import { createTaskReferenceToolDefinition } from '../src/task-reference-tool.ts'

describe('task_reference tool seam', () => {
  it('uses the invisible current-task anchor and renders official reference context', async () => {
    const prepared: string[] = []
    const receipt = { taskId: 'task-a', label: '任务 A', totalSessions: 1, omittedSessions: 0, sourceSessionIds: ['task-a'] }
    const definition = createTaskReferenceToolDefinition({
      currentTask: () => ({ sessionId: 'task-a', label: '任务 A' }),
      adapter: () => ({
        async prepare(input) {
          prepared.push(input.anchorSessionId)
          return {
            content: [],
            additionalContext: { content: [{ type: 'text', text: '<referenced-sessions>官方快照</referenced-sessions>' }] },
            receipt,
          }
        },
      }),
      findTasks: async () => [],
    })

    expect(definition.name).toBe('task_reference')
    const result = await definition.execute({}, { agent: { id: 'assistant' } })
    expect(prepared).toEqual(['task-a'])
    expect(result).toEqual({ status: 'referenced', task: receipt, context: '<referenced-sessions>官方快照</referenced-sessions>' })
    expect(definition.output.render({}, result)).toEqual([{ type: 'text', text: '<referenced-sessions>官方快照</referenced-sessions>' }])
  })

  it('refuses ambient task context for a casual greeting', async () => {
    let prepared = false
    const definition = createTaskReferenceToolDefinition({
      currentTask: () => ({ sessionId: 'task-a', label: '任务 A' }),
      adapter: () => ({
        async prepare() {
          prepared = true
          throw new Error('must not read task context for a greeting')
        },
      }),
      findTasks: async () => [],
    })
    const agent = {
      session: {
        events: [{ type: 'user/message', data: { message: { content: [{ type: 'text', text: '你好' }] } } }],
      },
    }

    const result = await definition.execute({}, { agent })

    expect(prepared).toBe(false)
    expect(result).toEqual({ status: 'unavailable', reason: 'the current user message does not request task context; answer it directly' })
  })

  it('selects another task by title instead of the current page task', async () => {
    const prepared: string[] = []
    const definition = createTaskReferenceToolDefinition({
      currentTask: () => ({ sessionId: 'task-a', label: '任务 A' }),
      adapter: () => ({
        async prepare(input) {
          prepared.push(input.anchorSessionId)
          return {
            content: [],
            additionalContext: { content: [{ type: 'text', text: '任务 B 快照' }] },
            receipt: { taskId: 'task-b', label: '任务 B', totalSessions: 1, omittedSessions: 0, sourceSessionIds: ['task-b'] },
          }
        },
      }),
      findTasks: async (query) => query === '任务 B' ? [{ sessionId: 'task-b', label: '任务 B' }] : [],
    })

    const result = await definition.execute({ task: '任务 B' }, { agent: { id: 'assistant' } })

    expect(prepared).toEqual(['task-b'])
    expect(result.status).toBe('referenced')
    expect(result.status === 'referenced' && result.task.label).toBe('任务 B')
  })
})
