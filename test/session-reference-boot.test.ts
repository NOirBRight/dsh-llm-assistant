import { describe, expect, it, vi } from 'vitest'

import { SESSION_REFERENCE_BUDGET, ensureSessionReference } from '../src/session-reference-boot.ts'

describe('ensureSessionReference', () => {
  it('leaves an existing resolver alone', async () => {
    const plugin = vi.fn()
    const load = vi.fn()
    const status = await ensureSessionReference({
      get: (name) => name === 'sessionReferenceResolver' ? {} : undefined,
      plugin,
    }, load)
    expect(status).toBe('present')
    expect(load).not.toHaveBeenCalled()
    expect(plugin).not.toHaveBeenCalled()
  })

  it('mounts the official plugin with the 64KiB budget when the tree has no resolver', async () => {
    const plugin = vi.fn(async () => undefined)
    const exported = function SessionReferenceResolver() { /* plugin class */ }
    const load = vi.fn(async () => ({ default: exported }))
    const status = await ensureSessionReference({
      get: () => undefined,
      plugin,
    }, load)
    expect(status).toBe('mounted')
    expect(load).toHaveBeenCalledWith('@deepseek-ai/dsh-session-reference')
    expect(plugin).toHaveBeenCalledWith(exported, { ...SESSION_REFERENCE_BUDGET })
    expect(SESSION_REFERENCE_BUDGET.maxReferenceBytes).toBe(65_536)
  })
})
