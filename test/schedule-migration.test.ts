import { describe, expect, it } from 'vitest'

import { captureActiveSchedules, restoreActiveSchedules, retireActiveSchedules } from '../src/schedule-migration.ts'

describe('schedule migration adapter seam', () => {
  it('copies exact active records and retires their old-session ids', () => {
    const record = { id: 'schedule-1', kind: 'every', prompt: 'check', everySeconds: 300, createdAt: '2026-08-19T00:00:00.000Z', scheduledAt: '2026-08-19T00:05:00.000Z' }
    const oldAppends: unknown[] = []
    const newAppends: unknown[] = []
    const oldAgent = { session: { events: [{ type: 'x' }], header: { seedLength: 3 }, append: (type: string, data: unknown) => { oldAppends.push({ type, data }) } } }
    const newAgent = { session: { events: [], header: {}, append: (type: string, data: unknown) => { newAppends.push({ type, data }) } } }
    const fold = (events: readonly unknown[], seedLength: number) => {
      expect(events).toBe(oldAgent.session.events)
      expect(seedLength).toBe(3)
      return { active: [record] }
    }

    const records = captureActiveSchedules(oldAgent, fold)
    restoreActiveSchedules(newAgent, records)
    retireActiveSchedules(oldAgent, records)

    expect(newAppends).toEqual([{ type: 'schedule/change', data: { version: 1, operation: 'create', schedule: record } }])
    expect(oldAppends).toEqual([{ type: 'schedule/change', data: { version: 1, operation: 'delete', id: 'schedule-1' } }])
  })
})
