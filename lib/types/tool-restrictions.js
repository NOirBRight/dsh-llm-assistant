/** Per-agent capability masks for the assistant and its duty session. */
export const DENY_SPAWN = [
    'delegate_worker',
    'subagent_claude_code',
    'subagent_codex',
    'worker_antigravity',
    'worker_cursor',
];
/** Sidebar registers these globally; only the current main-session helmsman can run them. */
export const DENY_BROWSER = [
    'browser_tabs',
    'browser_open',
    'browser_snapshot',
    'browser_click',
    'browser_fill',
];
const DENY_ASSISTANT_TOOLS = [
    ...DENY_SPAWN,
    'bash',
    'write',
    'edit',
    'str_replace_editor',
    ...DENY_BROWSER,
];
/**
 * Install a monotonic deny mask in one agent scope. Unknown names are retried
 * after every global registry change, so tools registered after setup cannot
 * leak into the agent. The re-entry guard is required because restrict() itself
 * emits tools/change synchronously.
 */
function keepDenied(agentCtx, deny) {
    const scoped = agentCtx.get('tools');
    if (scoped?.restrict === undefined)
        return;
    const restricted = new Set();
    let applying = false;
    const apply = () => {
        if (applying)
            return;
        applying = true;
        try {
            for (const name of deny) {
                if (restricted.has(name))
                    continue;
                try {
                    scoped.restrict?.({ deny: [name] });
                    restricted.add(name);
                }
                catch {
                    // Unknown global name: tools/change will retry after later registration.
                }
            }
        }
        finally {
            applying = false;
        }
    };
    agentCtx.on('tools/change', apply);
    apply();
}
export function restrictAssistantTools(agentCtx) {
    keepDenied(agentCtx, DENY_ASSISTANT_TOOLS);
}
export function restrictDutyTools(agentCtx) {
    keepDenied(agentCtx, DENY_ASSISTANT_TOOLS);
}
//# sourceMappingURL=tool-restrictions.js.map