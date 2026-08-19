import { describe, expect, it } from 'vitest'

import { DENY_SPAWN, restrictAssistantTools, restrictDutyTools } from '../src/tool-restrictions.ts'

class FakeToolPlane {
  readonly global = new Set<string>()
  readonly denied = new Set<string>()
  readonly restrictCalls: string[] = []
  readonly listeners = new Set<() => void>()

  readonly agentCtx = {
    get: (name: string): unknown => name === 'tools' ? { restrict: this.restrict } : undefined,
    on: (name: string, listener: () => void): void => {
      if (name === 'tools/change') this.listeners.add(listener)
    },
  }

  readonly restrict = (filter: { deny: readonly string[] }): void => {
    const name = filter.deny[0]
    if (name === undefined || !this.global.has(name)) {
      throw new Error('tools.restrict() names unknown global tool "' + String(name) + '"; known global tools: ' + ([...this.global].sort().join(', ') || '(none)'))
    }
    this.restrictCalls.push(name)
    this.denied.add(name)
    this.emitChange()
  }

  register(name: string): void {
    this.global.add(name)
    this.emitChange()
  }

  emitChange(): void {
    for (const listener of this.listeners) listener()
  }
}

describe('assistant tool restrictions', () => {
  it('retries a denied tool when it is registered after agent setup', () => {
    const plane = new FakeToolPlane()
    plane.register('bash')
    plane.register('browser_open')

    restrictAssistantTools(plane.agentCtx)
    expect(plane.denied.has('delegate_worker')).toBe(false)
    expect(plane.denied.has('browser_open')).toBe(true)

    plane.register('delegate_worker')

    expect(plane.denied.has('delegate_worker')).toBe(true)
    expect(plane.restrictCalls.filter((name) => name === 'delegate_worker')).toHaveLength(1)
    expect(plane.global.has('delegate_worker')).toBe(true)
  })

  it('keeps every named worker tool out of assistant and duty scopes without removing host tools', () => {
    for (const restrict of [restrictAssistantTools, restrictDutyTools]) {
      const plane = new FakeToolPlane()
      restrict(plane.agentCtx)

      for (const name of DENY_SPAWN) plane.register(name)

      expect([...plane.denied]).toEqual(expect.arrayContaining([...DENY_SPAWN]))
      expect([...plane.global]).toEqual(expect.arrayContaining([...DENY_SPAWN]))
    }
  })

  it('denies pwsh and later-registered worker_* names', () => {
    const plane = new FakeToolPlane()
    plane.register('pwsh')
    restrictAssistantTools(plane.agentCtx)
    expect(plane.denied.has('pwsh')).toBe(true)
    plane.register('worker_later')
    expect(plane.denied.has('worker_later')).toBe(true)
  })
})
