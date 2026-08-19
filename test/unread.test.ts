import { describe, expect, it } from 'vitest'

import { nextUnreadBaseline, shouldShowUnread } from '../src/unread.ts'

describe('seat unread baseline', () => {
  it('does not treat unseen history as unread, then lights when seq grows', () => {
    expect(nextUnreadBaseline(null, 12)).toBe(12)
    expect(shouldShowUnread(false, 12, 12)).toBe(false)
    expect(shouldShowUnread(false, 12, 13)).toBe(true)
    expect(shouldShowUnread(true, 12, 13)).toBe(false)
    expect(shouldShowUnread(false, null, 13)).toBe(false)
  })
})
