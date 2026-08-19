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
  'pwsh',
  'write',
  'edit',
  'str_replace_editor',
  ...DENY_BROWSER,
] as const

const DENY_NAME_PREFIXES = ['worker_', 'browser_'] as const

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
  const denyName = (name: string): void => {
    if (restricted.has(name) || scoped.restrict === undefined) return
    try {
      scoped.restrict({ deny: [name] })
      restricted.add(name)
    } catch (error) {
      for (const known of knownToolsFromRestrictError(error)) {
        if (shouldDenyDiscovered(known, deny)) denyName(known)
      }
    }
  }
  const apply = (): void => {
    if (applying) return
    applying = true
    try {
      for (const name of deny) denyName(name)
      denyName('__llm_assistant_unknown_probe__')
    } finally {
      applying = false
    }
  }

  agentCtx.on('tools/change', apply)
  apply()
}

function knownToolsFromRestrictError(error: unknown): string[] {
  const message = error instanceof Error ? error.message : String(error)
  const match = message.match(/known global tools: ([^\n]+)/)
  if (match === null || match[1] === undefined || match[1] === '(none)') return []
  return match[1].split(', ').map((name) => name.trim()).filter((name) => name !== '')
}

function shouldDenyDiscovered(name: string, deny: readonly string[]): boolean {
  if (name.startsWith('__llm_assistant')) return false
  if (deny.includes(name)) return true
  return DENY_NAME_PREFIXES.some((prefix) => name.startsWith(prefix))
}

export function restrictAssistantTools(agentCtx: ToolScopeContext): void {
  keepDenied(agentCtx, DENY_ASSISTANT_TOOLS)
}

export function restrictDutyTools(agentCtx: ToolScopeContext): void {
  keepDenied(agentCtx, DENY_ASSISTANT_TOOLS)
}
