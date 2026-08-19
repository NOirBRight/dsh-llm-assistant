/** Per-agent capability masks for the assistant and its duty session. */
export declare const DENY_SPAWN: readonly ["delegate_worker", "subagent_claude_code", "subagent_codex", "worker_antigravity", "worker_cursor"];
/** Sidebar registers these globally; only the current main-session helmsman can run them. */
export declare const DENY_BROWSER: readonly ["browser_tabs", "browser_open", "browser_snapshot", "browser_click", "browser_fill"];
/** Duty installs the heartbeat via session.append; the model must not mutate schedules. */
export declare const DENY_DUTY_SCHEDULE: readonly ["schedule_create", "schedule_delete", "schedule_list"];
export interface ToolScopeContext {
    get(name: string): unknown;
    on(name: 'tools/change', listener: () => void): unknown;
}
export declare function restrictAssistantTools(agentCtx: ToolScopeContext): void;
export declare function restrictDutyTools(agentCtx: ToolScopeContext): void;
//# sourceMappingURL=tool-restrictions.d.ts.map