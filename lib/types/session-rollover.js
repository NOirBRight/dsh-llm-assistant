/** Host-side assistant session rollover: bounded handoff and migration orchestration. */
const HANDOFF_MAX_BYTES = 4096;
const MAX_PATHS = 8;
export function buildSessionHandoff(snapshot) {
    const activeTodos = (snapshot.todos ?? []).filter((todo) => todo.status !== 'completed');
    const structured = snapshot.goal !== undefined || activeTodos.length > 0;
    const lines = ['【助理会话交接】'];
    if (snapshot.goal !== undefined)
        lines.push('当前目标：' + clip(snapshot.goal.title, 800));
    if (activeTodos.length > 0) {
        lines.push('未完成项：');
        for (const todo of activeTodos) {
            const marker = todo.status === 'in_progress' ? '进行中' : '待办';
            lines.push('- [' + marker + '] ' + clip(todo.content, 600));
        }
    }
    const recentUser = [...snapshot.messages].reverse().find((message) => message.role === 'user' && message.text.trim() !== '');
    const recentAssistant = [...snapshot.messages].reverse().find((message) => message.role === 'assistant' && message.text.trim() !== '' && (recentUser === undefined || message.seq > recentUser.seq));
    if (!structured) {
        if (recentUser !== undefined)
            lines.push('当前焦点：' + clip(recentUser.text, 500));
        if (recentAssistant !== undefined)
            lines.push('上次结论：' + clip(recentAssistant.text, 500));
    }
    const pathSources = [
        snapshot.goal?.title ?? '',
        ...activeTodos.map((todo) => todo.content),
        recentUser?.text ?? '',
        recentAssistant?.text ?? '',
    ];
    const paths = extractPaths(pathSources.join('\n'));
    if (paths.length > 0) {
        lines.push('必要路径：');
        for (const path of paths)
            lines.push('- ' + path);
    }
    lines.push('请从以上状态继续；不要假设旧 transcript 已复制。');
    return truncateUtf8(lines.join('\n'), HANDOFF_MAX_BYTES);
}
export class SessionRolloverError extends Error {
    code;
    constructor(code, message) {
        super(message);
        this.code = code;
        this.name = 'SessionRolloverError';
    }
}
export function createSessionRollover(deps) {
    let switching = false;
    return {
        get switching() { return switching; },
        async rollover() {
            if (switching)
                throw new SessionRolloverError('switching', '助理正在切换到新对话');
            const current = deps.current();
            if (current.handle.agent.status !== 'idle')
                throw new SessionRolloverError('busy', '助理回复完再新开');
            switching = true;
            let nextHandle;
            let committed = false;
            try {
                const result = await current.handle.agent.runMaintenance(async () => {
                    if (deps.current().handle !== current.handle)
                        throw new SessionRolloverError('switching', '助理会话已经切换');
                    const handoff = buildSessionHandoff(current.snapshot);
                    const schedules = deps.captureSchedules(current.handle.agent);
                    nextHandle = await deps.create(deps.newSessionId(), current.model);
                    return nextHandle.agent.runMaintenance(async () => {
                        nextHandle?.agent.inject(deps.handoffMessage(handoff));
                        deps.restoreSchedules(nextHandle.agent, schedules);
                        await deps.flush(nextHandle.agent);
                        const archivedSessionIds = [...new Set([...current.archivedSessionIds, current.handle.agent.id])];
                        deps.commit({ handle: nextHandle, archivedSessionIds });
                        committed = true;
                        try {
                            deps.retireSchedules(current.handle.agent, schedules);
                            await deps.flush(current.handle.agent);
                        }
                        catch (error) {
                            deps.warn('旧助理会话提醒清理失败：' + errorMessage(error));
                        }
                        return { sessionId: nextHandle.agent.id };
                    });
                });
                try {
                    await current.handle.dispose();
                }
                catch (error) {
                    deps.warn('旧助理会话归档失败：' + errorMessage(error));
                }
                return result;
            }
            catch (error) {
                if (!committed && nextHandle !== undefined) {
                    try {
                        await nextHandle.dispose();
                    }
                    catch (disposeError) {
                        deps.warn('新助理会话回滚失败：' + errorMessage(disposeError));
                    }
                }
                throw error;
            }
            finally {
                switching = false;
            }
        },
    };
}
function errorMessage(error) {
    return error instanceof Error ? error.message : String(error);
}
function extractPaths(text) {
    const found = text.match(/\/(?:[^\s\x60"'<>|()[\]{}，。；：、])+/g) ?? [];
    const unique = [];
    for (const raw of found) {
        const path = raw.replace(/[.,;:!?]+$/g, '');
        if (path.length < 2 || unique.includes(path))
            continue;
        unique.push(path);
        if (unique.length === MAX_PATHS)
            break;
    }
    return unique;
}
function clip(text, max) {
    const flat = text.replace(/\s+/g, ' ').trim();
    return flat.length <= max ? flat : flat.slice(0, max - 1) + '…';
}
function truncateUtf8(text, maxBytes) {
    if (Buffer.byteLength(text, 'utf8') <= maxBytes)
        return text;
    const suffix = '\n…（交接已截断）';
    const suffixBytes = Buffer.byteLength(suffix, 'utf8');
    let out = '';
    for (const char of text) {
        if (Buffer.byteLength(out + char, 'utf8') + suffixBytes > maxBytes)
            break;
        out += char;
    }
    return out + suffix;
}
//# sourceMappingURL=session-rollover.js.map