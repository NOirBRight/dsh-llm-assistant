import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { COMPOSER_ANCHOR_RETRY_MS } from '../src/client/composer-anchor.ts'
import { AssistantController } from '../src/client/controller.ts'
import { ASSISTANT_SNAPSHOT_ENDPOINT, type AssistantSnapshot } from '../src/contract.ts'

const idle: AssistantSnapshot = {
  sessionId: 'session-a', seq: 1, status: 'idle', messages: [], items: [], revision: 1,
}

class FakeEventSource {
  onopen: (() => void) | null = null
  onerror: (() => void) | null = null
  onmessage: ((event: { data: string }) => void) | null = null
  close(): void { /* noop */ }
}

describe('closed-panel overlay cost', () => {
  beforeEach(() => {
    ;(globalThis as { EventSource?: unknown }).EventSource = FakeEventSource
  })
  afterEach(() => {
    delete (globalThis as { EventSource?: unknown }).EventSource
  })

  it('does not use a standing 400ms composer poll', () => {
    expect(COMPOSER_ANCHOR_RETRY_MS).not.toContain(400)
    expect(COMPOSER_ANCHOR_RETRY_MS.length).toBeGreaterThan(0)
    expect(COMPOSER_ANCHOR_RETRY_MS.every((ms) => ms >= 200)).toBe(true)
  })

  it('does not start a 4s snapshot timer when the panel is closed', async () => {
    const call = vi.fn(async (_channel: string, endpoint: string) => {
      if (endpoint === ASSISTANT_SNAPSHOT_ENDPOINT) return { ok: true as const, value: idle }
      return { ok: false as const, error: { code: 'unused', message: 'unused' } }
    })
    const controller = new AssistantController({ get: () => ({ rpc: { call } }) } as never)
    controller.watch()
    await Promise.resolve()
    expect(controller.isPolling()).toBe(false)
    controller.close()
    expect(controller.isPolling()).toBe(false)
  })
})
