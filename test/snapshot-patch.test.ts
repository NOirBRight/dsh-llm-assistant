import { describe, expect, it } from 'vitest'
import type { AssistantSnapshot } from '../src/contract.ts'
import { applyAssistantSnapshotPatch, applyAssistantStreamFrame, diffAssistantSnapshot } from '../src/snapshot-patch.ts'

const base: AssistantSnapshot = {
  sessionId: 'assistant-1', seq: 10, revision: 10, status: 'running',
  messages: [], items: [], pending: '你', thinking: '', currentTool: 'bash', turnStartTime: 1_700_000_000_000,
}

describe('assistant SSE snapshot patches', () => {
  it('applies every token delta without waiting for a snapshot poll', () => {
    const next = applyAssistantStreamFrame(base, {
      type: 'delta', seq: 11, revision: 11, delta: { kind: 'text', text: '好' },
    })

    expect(next?.pending).toBe('你好')
    expect(next?.seq).toBe(11)
    expect(next?.status).toBe('running')
  })

  it('emits only token-level live fields for one chunk event', () => {
    const next: AssistantSnapshot = { ...base, seq: 11, revision: 11, pending: '你好' }
    const patch = diffAssistantSnapshot(base, next)

    expect(patch).toEqual({ seq: 11, revision: 11, pending: '你好' })
    expect(applyAssistantSnapshotPatch(base, patch)).toEqual(next)
  })

  it('can clear nullable live fields without resending history', () => {
    const next: AssistantSnapshot = {
      sessionId: 'assistant-1', seq: 12, revision: 12, status: 'idle',
      messages: [], items: [], pending: '', thinking: '',
    }
    const patch = diffAssistantSnapshot(base, next)

    expect(patch).toMatchObject({ status: 'idle', currentTool: null, turnStartTime: null })
    expect(patch).not.toHaveProperty('items')
    expect(applyAssistantSnapshotPatch(base, patch)).toEqual(next)
  })
})
