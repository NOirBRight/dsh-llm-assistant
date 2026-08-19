/** Per-agent capability masks for the assistant and its duty session. */
export declare const DENY_SPAWN: readonly ["delegate_worker", "subagent_claude_code", "subagent_codex", "worker_antigravity", "worker_cursor"];
export interface ToolScopeContext {
    get(name: string): unknown;
    on(name: 'tools/change', listener: () => void): unknown;
}
export declare function restrictAssistantTools(agentCtx: ToolScopeContext): void;
export declare function restrictDutyTools(agentCtx: ToolScopeContext): void;
//# sourceMappingURL=tool-restrictions.d.ts.map