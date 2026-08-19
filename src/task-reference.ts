/** Resolve one cross-session task into bounded official session references. */

import type { TaskReferenceReceipt } from './contract.ts'

export interface TaskSessionRecord {
  readonly header: {
    readonly id: string
    readonly createdAt: number
    readonly parentSession?: string
    readonly origin?: 'subagent'
  }
  readonly live: boolean
  readonly persisted: boolean
}

export interface TaskLineageNode {
  readonly session: TaskSessionRecord
  readonly descendants: readonly TaskLineageNode[]
}

export type TaskLineageTrace = {
  readonly target: TaskSessionRecord
  readonly ancestors: readonly TaskSessionRecord[]
  readonly descendants: readonly TaskLineageNode[]
} & ({ readonly complete: true; readonly root: TaskSessionRecord } | { readonly complete: false; readonly unresolvedParentId: string })

export interface TaskReferenceDependencies {
  traceSession(sessionId: string): Promise<TaskLineageTrace>
  readSurface(sessionId: string): Promise<{ readonly capturedThroughSeq: number | null; readonly events: readonly { readonly time?: number }[] }>
  readTitle(sessionId: string): Promise<{ readonly title?: string } | undefined>
  prepare(agent: unknown, content: readonly unknown[], references: readonly { readonly sessionId: string; readonly label?: string }[]): Promise<{ readonly content: readonly unknown[]; readonly additionalContext?: unknown }>
  deniedSessionIds(): readonly string[]
}

export interface TaskReferenceAdapter {
  prepare(input: { readonly agent: unknown; readonly content: readonly unknown[]; readonly anchorSessionId: string }): Promise<{ readonly content: readonly unknown[]; readonly additionalContext?: unknown; readonly receipt: TaskReferenceReceipt }>
}

export function createTaskReferenceAdapter(deps: TaskReferenceDependencies): TaskReferenceAdapter {
  return {
    async prepare(input) {
      const trace = await deps.traceSession(input.anchorSessionId)
      const root = trace.complete ? trace.root : trace.target
      const rootTrace = root.header.id === trace.target.header.id ? trace : await deps.traceSession(root.header.id)
      const denied = new Set(deps.deniedSessionIds())
      if (denied.has(trace.target.header.id) || denied.has(root.header.id)) throw new Error('cannot reference an assistant-owned session')
      const all = uniqueRecords([root, trace.target, ...flatten(rootTrace.descendants)])
        .filter((record) => record.header.origin !== 'subagent' && !denied.has(record.header.id))
      if (all.length === 0) throw new Error('task has no referenceable sessions')

      const selectedAnchor = trace.target.header.id !== root.header.id && trace.target.header.origin !== 'subagent' && !denied.has(trace.target.header.id)
        ? trace.target
        : undefined
      const reserved = new Set([root.header.id, ...(selectedAnchor === undefined ? [] : [selectedAnchor.header.id])])
      const ranked = await Promise.all(all.filter((record) => !reserved.has(record.header.id)).map(async (record) => {
        const surface = await deps.readSurface(record.header.id)
        return { record, activity: latestTime(surface.events) ?? record.header.createdAt }
      }))
      ranked.sort((left, right) => right.activity - left.activity || right.record.header.createdAt - left.record.header.createdAt || left.record.header.id.localeCompare(right.record.header.id))
      const selected = [root, ...(selectedAnchor === undefined ? [] : [selectedAnchor]), ...ranked.map((item) => item.record)].slice(0, 3)
      const title = await deps.readTitle(root.header.id)
      const label = title?.title?.trim() || root.header.id
      const references = selected.map((record, index) => ({
        sessionId: record.header.id,
        ...(index === 0 ? { label } : {}),
      }))
      const prepared = await deps.prepare(input.agent, input.content, references)
      return {
        ...prepared,
        receipt: {
          taskId: root.header.id,
          label,
          totalSessions: all.length,
          omittedSessions: Math.max(0, all.length - selected.length),
          sourceSessionIds: selected.map((record) => record.header.id),
        },
      }
    },
  }
}

function flatten(nodes: readonly TaskLineageNode[]): TaskSessionRecord[] {
  const records: TaskSessionRecord[] = []
  for (const node of nodes) {
    records.push(node.session, ...flatten(node.descendants))
  }
  return records
}

function uniqueRecords(records: readonly TaskSessionRecord[]): TaskSessionRecord[] {
  const seen = new Set<string>()
  return records.filter((record) => {
    if (seen.has(record.header.id)) return false
    seen.add(record.header.id)
    return true
  })
}

function latestTime(events: readonly { readonly time?: number }[]): number | undefined {
  let latest: number | undefined
  for (const event of events) {
    if (typeof event.time === 'number' && Number.isFinite(event.time) && (latest === undefined || event.time > latest)) latest = event.time
  }
  return latest
}
