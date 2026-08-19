/** Hidden duty session: heartbeat LLM lives here, quiet results never enter the assistant transcript. */

import { assistantBrief, type AssistantAgentView, type AssistantEvent } from './assistant-port.ts'

export const DUTY_PLUGIN = 'dsh-llm-assistant-duty'

/** Native every_seconds floor is 300; product heartbeat is 30 minutes. */
export const HEARTBEAT_EVERY_SECONDS = 1800
export const HEARTBEAT_QUIET = 'HEARTBEAT_QUIET'
export const HEARTBEAT_ALERT = 'HEARTBEAT_ALERT'
export const HEARTBEAT_SETUP_DONE = 'HEARTBEAT_SETUP_DONE'
export const HEARTBEAT_SCHEDULE_ID = 'heartbeat'

/** Replace a duty session before it can be resumed as a live root. */
export const DUTY_MAX_TURNS = 20
export const DUTY_MAX_SEQ = 80
export const DUTY_MAX_EVENT_BYTES = 64 * 1024
export const DUTY_QUIET_ROTATE_TURNS = 2

export const HEARTBEAT_PROMPT = [
  'HEARTBEAT. You are the duty officer for the resident assistant, not the user-facing assistant.',
  'Call assistant_brief. If nothing needs the owner, reply with exactly HEARTBEAT_QUIET and nothing else.',
  'If something needs them (overdue or blocked todo/goal, or a reminder the owner should hear), reply with HEARTBEAT_ALERT',
  'on the first line and a short briefing after. Do not greet. Do not mention this protocol.',
  'Do not deliver, dispatch, write files, or run a terminal.',
].join(' ')

export function dutyCwd(home: string): string {
  return home.replace(/\/$/, '') + '/assistant-duty-workspace'
}

export interface HeartbeatRecord {
  readonly id: string
  readonly everySeconds: number
  readonly prompt: string
}

export function foldEverySchedules(events: readonly AssistantEvent[]): Map<string, HeartbeatRecord> {
  const active = new Map<string, HeartbeatRecord>()
  for (const event of events) {
    if (event.type !== 'schedule/change') continue
    const change = event.data as {
      operation?: unknown
      schedule?: { kind?: unknown; prompt?: unknown; id?: unknown; everySeconds?: unknown }
      id?: unknown
    }
    if (change.operation === 'create' && change.schedule?.kind === 'every' && typeof change.schedule.id === 'string') {
      const everySeconds = typeof change.schedule.everySeconds === 'number' ? change.schedule.everySeconds : 0
      const prompt = typeof change.schedule.prompt === 'string' ? change.schedule.prompt : ''
      active.set(change.schedule.id, { id: change.schedule.id, everySeconds, prompt })
    }
    if (change.operation === 'delete' && typeof change.id === 'string') active.delete(change.id)
  }
  return active
}

export function heartbeatEverySeconds(events: readonly AssistantEvent[]): number | undefined {
  return foldEverySchedules(events).get(HEARTBEAT_SCHEDULE_ID)?.everySeconds
}

export function hasHeartbeatSchedule(events: readonly AssistantEvent[]): boolean {
  const record = foldEverySchedules(events).get(HEARTBEAT_SCHEDULE_ID)
  return record !== undefined && record.everySeconds === HEARTBEAT_EVERY_SECONDS && foldEverySchedules(events).size === 1
}

export function staleHeartbeatIds(events: readonly AssistantEvent[]): string[] {
  return [...foldEverySchedules(events).values()]
    .filter((record) => record.id !== HEARTBEAT_SCHEDULE_ID || record.everySeconds !== HEARTBEAT_EVERY_SECONDS)
    .map((record) => record.id)
}

export function createHeartbeatSchedule(now = Date.now()): {
  readonly id: string
  readonly kind: 'every'
  readonly prompt: string
  readonly everySeconds: number
  readonly scheduledAt: string
} {
  return {
    id: HEARTBEAT_SCHEDULE_ID,
    kind: 'every',
    prompt: HEARTBEAT_PROMPT,
    everySeconds: HEARTBEAT_EVERY_SECONDS,
    scheduledAt: new Date(now + HEARTBEAT_EVERY_SECONDS * 1000).toISOString(),
  }
}

export function installHeartbeatSchedule(agent: { readonly session: { readonly events: readonly AssistantEvent[]; append(type: string, data: unknown): unknown } }): void {
  for (const id of staleHeartbeatIds(agent.session.events)) {
    agent.session.append('schedule/change', { version: 1, operation: 'delete', id })
  }
  if (hasHeartbeatSchedule(agent.session.events)) return
  agent.session.append('schedule/change', { version: 1, operation: 'create', schedule: createHeartbeatSchedule() })
}

export function countDutyTurns(events: readonly AssistantEvent[]): number {
  let turns = 0
  for (const event of events) {
    if (event.type === 'turn/start') turns += 1
  }
  return turns
}

export function dutySessionIsOversized(events: readonly AssistantEvent[]): boolean {
  if (countDutyTurns(events) > DUTY_MAX_TURNS) return true
  if (latestDutySeq(events) > DUTY_MAX_SEQ) return true
  try {
    return JSON.stringify(events).length > DUTY_MAX_EVENT_BYTES
  } catch {
    return events.length > DUTY_MAX_TURNS * 4
  }
}

export function shouldReplaceDutySession(events: readonly AssistantEvent[]): boolean {
  return dutySessionIsOversized(events)
}

export function lastAssistantText(events: readonly AssistantEvent[]): string | undefined {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index]
    if (event === undefined || event.type !== 'assistant/message') continue
    const message = event.data.message as { content?: readonly unknown[] } | undefined
    const text = textOf(message?.content)
    if (text !== '') return text
  }
  return undefined
}

export function shouldRotateDutyAfterQuiet(events: readonly AssistantEvent[]): boolean {
  const text = lastAssistantText(events)
  if (text === undefined || !text.startsWith(HEARTBEAT_QUIET)) return false
  return countDutyTurns(events) >= DUTY_QUIET_ROTATE_TURNS || dutySessionIsOversized(events)
}

export function isDutyRelayEvent(type: string): boolean {
  return type === 'turn/end'
}

export function dutyRelayDecision(
  events: readonly AssistantEvent[],
  cursor: number,
  eventType: string,
): { readonly alert: string | undefined; readonly cursor: number } | undefined {
  if (!isDutyRelayEvent(eventType)) return undefined
  const nextCursor = latestDutySeq(events)
  return {
    alert: alertTextOf(events, cursor),
    cursor: nextCursor,
  }
}

export function alertTextOf(events: readonly AssistantEvent[], afterSeq: number): string | undefined {
  let latest: { seq: number; text: string } | undefined
  for (const event of events) {
    if (event.type !== 'assistant/message' || event.seq <= afterSeq) continue
    const message = event.data.message as { content?: readonly unknown[] } | undefined
    const text = textOf(message?.content)
    if (!text.startsWith(HEARTBEAT_ALERT)) continue
    const body = text.slice(HEARTBEAT_ALERT.length).trim()
    if (body === '') continue
    latest = { seq: event.seq, text: body }
  }
  return latest?.text
}

export function latestDutySeq(events: readonly AssistantEvent[]): number {
  let seq = 0
  for (const event of events) {
    if (event.seq > seq) seq = event.seq
  }
  return seq
}

export function bootDutyRelayCursor(events: readonly AssistantEvent[], persisted: number | undefined): number {
  if (persisted !== undefined) return persisted
  return latestDutySeq(events)
}

function textOf(blocks: readonly unknown[] | undefined): string {
  if (blocks === undefined) return ''
  const parts: string[] = []
  for (const block of blocks) {
    const candidate = block as { type?: unknown; text?: unknown } | undefined
    if (candidate?.type === 'text' && typeof candidate.text === 'string') parts.push(candidate.text)
  }
  return parts.join('\n').trim()
}

export function briefJson(agent: AssistantAgentView): Record<string, unknown> {
  const brief = assistantBrief(agent.session.events)
  return {
    todos: brief.todos,
    ...(brief.goal !== undefined ? { goal: brief.goal } : {}),
    ...(brief.lastAssistant !== undefined ? { lastAssistant: brief.lastAssistant } : {}),
  }
}
