/** Unread baseline for the seat whale (AC-BUBBLE-1/3). */

export function nextUnreadBaseline(stored: number | null, currentSeq: number): number {
  return stored === null ? currentSeq : stored
}

export function shouldShowUnread(open: boolean, lastSeenSeq: number | null, currentSeq: number): boolean {
  if (open || lastSeenSeq === null) return false
  return currentSeq > lastSeenSeq
}
