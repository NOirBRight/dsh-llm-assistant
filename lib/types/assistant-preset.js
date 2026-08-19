export const ASSISTANT_PRESET_ID = 'llm-assistant';
/**
 * Rows the standing composition loads. Intentionally not `standard`: no
 * shell, no write/edit (registered by tool-fs then denied), no delegation,
 * no Code Mode, no cordis self-modification, no persona override.
 */
export const ASSISTANT_PRESET_ROWS = [
    { id: 'tool-web', name: '@deepseek-ai/dsh-tool-web', config: { fetch: false, searchTimeoutMs: 60_000 } },
    { id: 'tool-fs', name: '@deepseek-ai/dsh-tool-fs' },
    { id: 'tool-fs-search', name: '@deepseek-ai/dsh-tool-fs-search', config: { sampleOverCapGlobResults: false } },
    { id: 'tool-todo', name: '@deepseek-ai/dsh-tool-todo', config: { allowParallelInProgress: true } },
    { id: 'tool-goal', name: '@deepseek-ai/dsh-tool-goal' },
];
export const ASSISTANT_PRESET_EXPECTED_TOOLS = [
    'web_search',
    'read',
    'glob',
    'grep',
    'todo_write',
    'create_goal',
    'get_goal',
    'update_goal',
];
export const ASSISTANT_PRESET_FORBIDDEN_ROWS = [
    'tool-bash',
    'tool-pwsh',
    'tool-subagent',
    'tool-workflow',
    'tool-ralph',
    'tool-cordis',
    'tool-presentation',
    'persona',
];
/**
 * Bind one agent onto an already-mounted standing key. Extracted so tests
 * cover the join without a live Cordis tree.
 */
export function joinStandingScope(scopeApi, agentCtx, standingKey) {
    const agentKey = scopeApi.scopeOf(agentCtx);
    if (agentKey === undefined)
        return false;
    scopeApi.bindScopeParent(agentKey, standingKey);
    return true;
}
async function awaitPlugin(handle) {
    if (handle === undefined || handle === null)
        return;
    if (typeof handle === 'object' && typeof handle.await === 'function') {
        await handle.await();
        return;
    }
    await handle;
}
export function createAssistantPreset(options) {
    const standingKey = { id: ASSISTANT_PRESET_ID };
    let standing;
    const ensureStanding = () => {
        standing ??= (async () => {
            const scopeMod = await options.load('@deepseek-ai/dsh-scope');
            if (typeof scopeMod.createScope !== 'function' || typeof scopeMod.scopeOf !== 'function' || typeof scopeMod.bindScopeParent !== 'function') {
                throw new Error('dsh-scope does not export createScope/scopeOf/bindScopeParent');
            }
            const scope = scopeMod.createScope(options.host, standingKey);
            for (const row of ASSISTANT_PRESET_ROWS) {
                try {
                    const mod = await options.load(row.name);
                    await awaitPlugin(scope.ctx.plugin(mod, row.config));
                    options.log('preset row ' + row.id + ' mounted');
                }
                catch (error) {
                    options.log('WARN preset row ' + row.id + ' failed: ' + (error instanceof Error ? error.message : String(error)));
                }
            }
            return scopeMod;
        })();
        return standing;
    };
    return {
        async join(agentCtx) {
            const scopeMod = await ensureStanding();
            if (!joinStandingScope(scopeMod, agentCtx, standingKey)) {
                options.log('WARN assistant ctx has no scope key — private preset not joined');
            }
        },
    };
}
//# sourceMappingURL=assistant-preset.js.map