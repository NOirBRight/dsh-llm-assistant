/** Exact-record migration adapter for agent-scoped durable schedules. */

export interface ScheduleRecord {
  readonly id: string
  readonly [key: string]: unknown
}

export interface ScheduleAgentView {
  readonly session: {
    readonly events: readonly unknown[]
    readonly header: { readonly seedLength?: number }
    append(type: string, data: unknown): unknown
  }
}

export type FoldScheduleEvents = (events: readonly unknown[], seedLength?: number) => { readonly active: readonly ScheduleRecord[] }

export function captureActiveSchedules(agent: ScheduleAgentView, fold: FoldScheduleEvents): readonly ScheduleRecord[] {
  const active = fold(agent.session.events, agent.session.header.seedLength ?? 0).active
  for (const record of active) {
    if (typeof record.id !== 'string' || record.id.trim() === '') throw new Error('schedule fold returned a record without an id')
  }
  return [...active]
}

export function restoreActiveSchedules(agent: ScheduleAgentView, records: readonly ScheduleRecord[]): void {
  for (const schedule of records) {
    agent.session.append('schedule/change', { version: 1, operation: 'create', schedule })
  }
}

export function retireActiveSchedules(agent: ScheduleAgentView, records: readonly ScheduleRecord[]): void {
  for (const record of records) {
    agent.session.append('schedule/change', { version: 1, operation: 'delete', id: record.id })
  }
}
