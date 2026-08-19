import type { AssistantSnapshot, ContextChrome, GoalItem, ModelChrome, TimelineItem, TodoItem, AssistantMessage } from './contract.ts'

export interface AssistantSnapshotPatch {
  readonly sessionId?: string
  readonly seq?: number
  readonly revision?: number
  readonly status?: AssistantSnapshot['status']
  readonly messages?: readonly AssistantMessage[]
  readonly items?: readonly TimelineItem[]
  readonly pending?: string | null
  readonly thinking?: string | null
  readonly currentTool?: string | null
  readonly turnStartTime?: number | null
  readonly model?: ModelChrome | null
  readonly context?: ContextChrome | null
  readonly todos?: readonly TodoItem[] | null
  readonly goal?: GoalItem | null
  readonly taskReferenceAvailable?: boolean | null
}

export type AssistantLiveDelta =
  | { readonly kind: 'text'; readonly text: string }
  | { readonly kind: 'reasoning'; readonly text: string }
  | { readonly kind: 'tool'; readonly name: string }

export type AssistantStreamFrame =
  | { readonly type: 'snapshot'; readonly snapshot: AssistantSnapshot }
  | { readonly type: 'patch'; readonly patch: AssistantSnapshotPatch }
  | { readonly type: 'delta'; readonly seq: number; readonly revision: number; readonly delta: AssistantLiveDelta }

export function diffAssistantSnapshot(previous: AssistantSnapshot, next: AssistantSnapshot): AssistantSnapshotPatch {
  const patch: Record<string, unknown> = {}
  copyChanged(patch, 'sessionId', previous.sessionId, next.sessionId)
  copyChanged(patch, 'seq', previous.seq, next.seq)
  copyChanged(patch, 'revision', previous.revision, next.revision)
  copyChanged(patch, 'status', previous.status, next.status)
  copyStructured(patch, 'messages', previous.messages, next.messages)
  copyStructured(patch, 'items', previous.items, next.items)
  copyOptional(patch, 'pending', previous.pending, next.pending)
  copyOptional(patch, 'thinking', previous.thinking, next.thinking)
  copyOptional(patch, 'currentTool', previous.currentTool, next.currentTool)
  copyOptional(patch, 'turnStartTime', previous.turnStartTime, next.turnStartTime)
  copyStructuredOptional(patch, 'model', previous.model, next.model)
  copyStructuredOptional(patch, 'context', previous.context, next.context)
  copyStructuredOptional(patch, 'todos', previous.todos, next.todos)
  copyStructuredOptional(patch, 'goal', previous.goal, next.goal)
  copyOptional(patch, 'taskReferenceAvailable', previous.taskReferenceAvailable, next.taskReferenceAvailable)
  return patch as AssistantSnapshotPatch
}

export function applyAssistantSnapshotPatch(snapshot: AssistantSnapshot, patch: AssistantSnapshotPatch): AssistantSnapshot {
  const next = { ...snapshot, ...patch } as Record<string, unknown>
  for (const key of OPTIONAL_KEYS) if (next[key] === null) delete next[key]
  return next as unknown as AssistantSnapshot
}

export function applyAssistantLiveDelta(
  snapshot: AssistantSnapshot,
  delta: AssistantLiveDelta,
  seq: number,
  revision: number,
): AssistantSnapshot {
  if (delta.kind === 'text') return { ...snapshot, seq, revision, pending: (snapshot.pending ?? '') + delta.text }
  if (delta.kind === 'reasoning') return { ...snapshot, seq, revision, thinking: (snapshot.thinking ?? '') + delta.text }
  return { ...snapshot, seq, revision, currentTool: delta.name }
}

export function applyAssistantStreamFrame(snapshot: AssistantSnapshot | undefined, frame: AssistantStreamFrame): AssistantSnapshot | undefined {
  if (frame.type === 'snapshot') return frame.snapshot
  if (snapshot === undefined) return undefined
  if (frame.type === 'patch') return applyAssistantSnapshotPatch(snapshot, frame.patch)
  return applyAssistantLiveDelta(snapshot, frame.delta, frame.seq, frame.revision)
}

function copyChanged(target: Record<string, unknown>, key: string, previous: unknown, next: unknown): void {
  if (previous !== next) target[key] = next
}

function copyOptional(target: Record<string, unknown>, key: string, previous: unknown, next: unknown): void {
  if (previous !== next) target[key] = next === undefined ? null : next
}

function copyStructured(target: Record<string, unknown>, key: string, previous: unknown, next: unknown): void {
  if (JSON.stringify(previous) !== JSON.stringify(next)) target[key] = next
}

function copyStructuredOptional(target: Record<string, unknown>, key: string, previous: unknown, next: unknown): void {
  if (JSON.stringify(previous) !== JSON.stringify(next)) target[key] = next === undefined ? null : next
}

const OPTIONAL_KEYS = ['pending', 'thinking', 'currentTool', 'turnStartTime', 'model', 'context', 'todos', 'goal', 'taskReferenceAvailable'] as const
