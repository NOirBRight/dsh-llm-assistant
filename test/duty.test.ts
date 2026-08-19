import { describe, expect, it } from 'vitest'

import {
  DUTY_PLUGIN,
  HEARTBEAT_EVERY_SECONDS,
  HEARTBEAT_PROMPT,
  createHeartbeatSchedule,
  staleHeartbeatIds,
} from '../src/duty.ts'

describe('duty heartbeat install', () => {
  it('uses the product interval and a canonical every-record', () => {
    expect(HEARTBEAT_EVERY_SECONDS).toBe(1800)
    expect(DUTY_PLUGIN).toBe('dsh-llm-assistant-duty')
    const record = createHeartbeatSchedule(1_000)
    expect(record).toEqual({
      id: 'heartbeat',
      kind: 'every',
      prompt: HEARTBEAT_PROMPT,
      everySeconds: 1800,
      scheduledAt: new Date(1_000 + 1800 * 1000).toISOString(),
    })
  })

  it('identifies leftover lab-interval heartbeat records', () => {
    const events = [
      {
        type: 'schedule/change',
        seq: 1,
        time: 1,
        data: {
          operation: 'create',
          schedule: { id: 'old', kind: 'every', prompt: HEARTBEAT_PROMPT, everySeconds: 300 },
        },
      },
    ]
    expect(staleHeartbeatIds(events)).toEqual(['old'])
  })
})
