import type { SessionListState } from '@deepseek-ai/dsh-client-runtime/client'
import type { SnapshotSelectorHook } from '@deepseek-ai/dsh-client-ui-slots'

export function selectSessionList(useSessions: SnapshotSelectorHook<SessionListState>): SessionListState {
  return useSessions((state) => state)
}
