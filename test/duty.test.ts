import { describe, expect, it } from 'vitest'

import type { AssistantEvent } from '../src/assistant-port.ts'
import {
  DUTY_PLUGIN,
  HEARTBEAT_ALERT,
  HEARTBEAT_EVERY_SECONDS,
  HEARTBEAT_PROMPT,
  HEARTBEAT_QUIET,
  HEARTBEAT_SCHEDULE_ID,
  bootDutyRelayCursor,
  createHeartbeatSchedule,
  dutyRelayDecision,
  foldEverySchedules,
  installHeartbeatSchedule,
  shouldReplaceDutySession,
  shouldRotateDutyAfterQuiet,
  staleHeartbeatIds,
} from '../src/duty.ts'

function event(type: string, seq: number, data: Record<string, unknown> = {}): AssistantEvent {
  return { type, seq, time: seq, data }
}

function everyCreate(id: string, everySeconds: number, seq: number, prompt = HEARTBEAT_PROMPT): AssistantEvent {
  return event('schedule/change', seq, {
    version: 1,
    operation: 'create',
    schedule: { id, kind: 'every', prompt, everySeconds, scheduledAt: new Date(seq).toISOString() },
  })
}

describe('duty heartbeat install', () => {
  it('uses the product interval and a canonical every-record', () => {
    expect(HEARTBEAT_EVERY_SECONDS).toBe(1800)
    expect(DUTY_PLUGIN).toBe('dsh-llm-assistant-duty')
    const record = createHeartbeatSchedule(1_000)
    expect(record).toEqual({
      id: HEARTBEAT_SCHEDULE_ID,
      kind: 'every',
      prompt: HEARTBEAT_PROMPT,
      everySeconds: 1800,
      scheduledAt: new Date(1_000 + 1800 * 1000).toISOString(),
    })
  })

  it('identifies leftover lab-interval heartbeat records including schedule-2 ids', () => {
    const events = [everyCreate('schedule-2', 300, 1)]
    expect(staleHeartbeatIds(events)).toEqual(['schedule-2'])
  })

  it('migrates a 300s HEARTBEAT every-record to a single 1800s heartbeat', () => {
    const events: AssistantEvent[] = [
      everyCreate('schedule-2', 300, 1),
      everyCreate(HEARTBEAT_SCHEDULE_ID, 1800, 2),
    ]
    const agent = { session: { events, append(type: string, data: unknown) { events.push(event(type, events.length + 1, data as Record<string, unknown>)) } } }
    installHeartbeatSchedule(agent)
    const active = foldEverySchedules(events)
    expect([...active.keys()]).toEqual([HEARTBEAT_SCHEDULE_ID])
    expect(active.get(HEARTBEAT_SCHEDULE_ID)?.everySeconds).toBe(1800)
  })

  it('replaces a lone 300s record with the canonical 1800s heartbeat', () => {
    const events: AssistantEvent[] = [everyCreate('schedule-2', 300, 1)]
    const agent = { session: { events, append(type: string, data: unknown) { events.push(event(type, events.length + 1, data as Record<string, unknown>)) } } }
    installHeartbeatSchedule(agent)
    const active = foldEverySchedules(events)
    expect([...active.entries()]).toEqual([[HEARTBEAT_SCHEDULE_ID, expect.objectContaining({ everySeconds: 1800 })]])
  })
})

describe('duty session size', () => {
  it('refuses to resume a duty log with 100 turns', () => {
    const events: AssistantEvent[] = []
    for (let turn = 1; turn <= 100; turn += 1) {
      events.push(event('turn/start', turn * 2 - 1))
      events.push(event('turn/end', turn * 2))
    }
    expect(shouldReplaceDutySession(events)).toBe(true)
    expect(shouldReplaceDutySession([event('turn/start', 1), event('turn/end', 2)])).toBe(false)
  })

  it('rotates after a quiet heartbeat once the duty log is no longer tiny', () => {
    const events: AssistantEvent[] = [
      event('turn/start', 1),
      event('assistant/message', 2, { message: { content: [{ type: 'text', text: HEARTBEAT_QUIET }] } }),
      event('turn/end', 3),
      event('turn/start', 4),
      event('assistant/message', 5, { message: { content: [{ type: 'text', text: HEARTBEAT_QUIET }] } }),
      event('turn/end', 6),
    ]
    expect(shouldRotateDutyAfterQuiet(events)).toBe(true)
  })
})

describe('duty relay cursor', () => {
  it('does not scan or relay on assistant/chunk', () => {
    expect(dutyRelayDecision([], 0, 'assistant/chunk')).toBeUndefined()
  })

  it('advances the cursor on turn/end and does not re-deliver an old HEARTBEAT_ALERT', () => {
    const events: AssistantEvent[] = [
      event('assistant/message', 4, { message: { content: [{ type: 'text', text: HEARTBEAT_ALERT + ' old' }] } }),
      event('turn/end', 5),
      event('assistant/message', 9, { message: { content: [{ type: 'text', text: HEARTBEAT_ALERT + ' new' }] } }),
      event('turn/end', 10),
    ]
    const first = dutyRelayDecision(events.slice(0, 2), 0, 'turn/end')
    expect(first).toEqual({ alert: 'old', cursor: 5 })
    const replay = dutyRelayDecision(events, 5, 'turn/end')
    expect(replay).toEqual({ alert: 'new', cursor: 10 })
    const again = dutyRelayDecision(events, 10, 'turn/end')
    expect(again).toEqual({ alert: undefined, cursor: 10 })
  })

  it('boots the cursor at the latest seq so historical alerts are not replayed', () => {
    const events: AssistantEvent[] = [
      event('assistant/message', 8, { message: { content: [{ type: 'text', text: HEARTBEAT_ALERT + ' stale' }] } }),
    ]
    expect(bootDutyRelayCursor(events, undefined)).toBe(8)
    expect(dutyRelayDecision(events, 8, 'turn/end')).toEqual({ alert: undefined, cursor: 8 })
  })
})
