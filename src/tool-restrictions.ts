/** Per-agent capability masks for the assistant and its duty session. */

export const DENY_SPAWN = [
  'delegate_worker',
  'subagent_claude_code',
  'subagent_codex',
  'worker_antigravity',
  'worker_cursor',
] as const

/** Sidebar registers these globally; only the current main-session helmsman can run them. */
export const DENY_BROWSER = [
  'browser_tabs',
  'browser_open',
  'browser_snapshot',
  'browser_click',
  'browser_fill',
] as const

const DENY_ASSISTANT_TOOLS = [
  ...DENY_SPAWN,
  'bash',
  'write',
  'edit',
  'str_replace_editor',
  ...DENY_BROWSER,
] as const

interface ScopedToolsService {
  restrict(filter: { deny: readonly string[] }): unknown
}

export interface ToolScopeContext {
  get(name: string): unknown
  on(name: 'tools/change', listener: () => void): unknown
}

/**
 * Install a monotonic deny mask in one agent scope. Unknown names are retried
 * after every global registry change, so tools registered after setup cannot
 * leak into the agent. The re-entry guard is required because restrict() itself
 * emits tools/change synchronously.
 */
function keepDenied(agentCtx: ToolScopeContext, deny: readonly string[]): void {
  const scoped = agentCtx.get('tools') as Partial<ScopedToolsService> | undefined
  if (scoped?.restrict === undefined) return

  const restricted = new Set<string>()
  let applying = false
  const apply = (): void => {
    if (applying) return
    applying = true
    try {
      for (const name of deny) {
        if (restricted.has(name)) continue
        try {
          scoped.restrict?.({ deny: [name] })
          restricted.add(name)
        } catch {
          // Unknown global name: tools/change will retry after later registration.
        }
      }
    } finally {
      applying = false
    }
  }

  agentCtx.on('tools/change', apply)
  apply()
}

export function restrictAssistantTools(agentCtx: ToolScopeContext): void {
  keepDenied(agentCtx, DENY_ASSISTANT_TOOLS)
}

export function restrictDutyTools(agentCtx: ToolScopeContext): void {
  keepDenied(agentCtx, DENY_ASSISTANT_TOOLS)
}
