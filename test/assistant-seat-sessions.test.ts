import { describe, expect, it } from 'vitest'

import { selectSessionList } from '../src/client/session-list.ts'

describe('assistant seat session-list hook contract', () => {
  it('always supplies the required selector to useSessions', () => {
    const state = { ids: [], byId: {}, current: undefined }
    let receivedSelector = false
    const useSessions = ((selector: unknown) => {
      receivedSelector = typeof selector === 'function'
      if (!receivedSelector) throw new TypeError('selector is not a function')
      return (selector as (value: typeof state) => typeof state)(state)
    }) as never

    expect(selectSessionList(useSessions)).toBe(state)
    expect(receivedSelector).toBe(true)
  })
})
