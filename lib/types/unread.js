/** Unread baseline for the seat whale (AC-BUBBLE-1/3). */
export function nextUnreadBaseline(stored, currentSeq) {
    return stored === null ? currentSeq : stored;
}
export function shouldShowUnread(open, lastSeenSeq, currentSeq) {
    if (open || lastSeenSeq === null)
        return false;
    return currentSeq > lastSeenSeq;
}
//# sourceMappingURL=unread.js.map