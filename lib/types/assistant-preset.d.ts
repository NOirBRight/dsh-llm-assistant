/**
 * Plugin-private standing composition for the assistant Agent.
 *
 * Web moved model-facing tools onto agent presets. The assistant is created
 * by this plugin, not the session picker, so it never joined `standard` and
 * lost web_search / read / grep. This module mounts a narrow composition
 * under a standing scope this plugin owns, then parents each assistant
 * Agent onto it — the same join mechanism as `agentPresets.mount`, without
 * adding a roster root the main-window picker would list.
 */
import type { Context } from '@deepseek-ai/cordis';
export declare const ASSISTANT_PRESET_ID = "llm-assistant";
export interface AssistantPresetRow {
    readonly id: string;
    readonly name: string;
    readonly config?: Record<string, unknown>;
}
/**
 * Rows the standing composition loads. Intentionally not `standard`: no
 * shell, no write/edit (registered by tool-fs then denied), no delegation,
 * no Code Mode, no cordis self-modification, no persona override.
 */
export declare const ASSISTANT_PRESET_ROWS: readonly AssistantPresetRow[];
export declare const ASSISTANT_PRESET_EXPECTED_TOOLS: readonly ["web_search", "read", "glob", "grep", "todo_write", "create_goal", "get_goal", "update_goal"];
export declare const ASSISTANT_PRESET_FORBIDDEN_ROWS: readonly ["tool-bash", "tool-pwsh", "tool-subagent", "tool-workflow", "tool-ralph", "tool-cordis", "tool-presentation", "persona"];
interface ScopeModule {
    createScope(ctx: unknown, key: object): {
        ctx: PluginHost;
    };
    scopeOf(ctx: object): object | undefined;
    bindScopeParent(child: object, parent: object): unknown;
}
interface PluginHost {
    plugin(module: unknown, config?: unknown): unknown;
}
export interface AssistantPreset {
    join(agentCtx: object): Promise<void>;
}
export interface AssistantPresetOptions {
    readonly host: Context;
    readonly load: (id: string) => Promise<unknown>;
    readonly log: (line: string) => void;
}
/**
 * Bind one agent onto an already-mounted standing key. Extracted so tests
 * cover the join without a live Cordis tree.
 */
export declare function joinStandingScope(scopeApi: Pick<ScopeModule, 'scopeOf' | 'bindScopeParent'>, agentCtx: object, standingKey: object): boolean;
export declare function createAssistantPreset(options: AssistantPresetOptions): AssistantPreset;
export {};
//# sourceMappingURL=assistant-preset.d.ts.map