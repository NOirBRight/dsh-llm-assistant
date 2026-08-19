export function diffAssistantSnapshot(previous, next) {
    const patch = {};
    copyChanged(patch, 'sessionId', previous.sessionId, next.sessionId);
    copyChanged(patch, 'seq', previous.seq, next.seq);
    copyChanged(patch, 'revision', previous.revision, next.revision);
    copyChanged(patch, 'status', previous.status, next.status);
    copyStructured(patch, 'messages', previous.messages, next.messages);
    copyStructured(patch, 'items', previous.items, next.items);
    copyOptional(patch, 'pending', previous.pending, next.pending);
    copyOptional(patch, 'thinking', previous.thinking, next.thinking);
    copyOptional(patch, 'currentTool', previous.currentTool, next.currentTool);
    copyOptional(patch, 'turnStartTime', previous.turnStartTime, next.turnStartTime);
    copyStructuredOptional(patch, 'model', previous.model, next.model);
    copyStructuredOptional(patch, 'context', previous.context, next.context);
    copyStructuredOptional(patch, 'todos', previous.todos, next.todos);
    copyStructuredOptional(patch, 'goal', previous.goal, next.goal);
    copyOptional(patch, 'taskReferenceAvailable', previous.taskReferenceAvailable, next.taskReferenceAvailable);
    copyOptional(patch, 'notice', previous.notice, next.notice);
    return patch;
}
export function applyAssistantSnapshotPatch(snapshot, patch) {
    const next = { ...snapshot, ...patch };
    for (const key of OPTIONAL_KEYS)
        if (next[key] === null)
            delete next[key];
    return next;
}
export function applyAssistantLiveDelta(snapshot, delta, seq, revision) {
    if (delta.kind === 'text')
        return { ...snapshot, seq, revision, status: 'running', pending: (snapshot.pending ?? '') + delta.text };
    if (delta.kind === 'reasoning')
        return { ...snapshot, seq, revision, status: 'running', thinking: (snapshot.thinking ?? '') + delta.text };
    return { ...snapshot, seq, revision, status: 'running', currentTool: delta.name };
}
export function applyAssistantStreamFrame(snapshot, frame) {
    if (frame.type === 'snapshot')
        return frame.snapshot;
    if (snapshot === undefined)
        return undefined;
    if (frame.type === 'patch')
        return applyAssistantSnapshotPatch(snapshot, frame.patch);
    return applyAssistantLiveDelta(snapshot, frame.delta, frame.seq, frame.revision);
}
function copyChanged(target, key, previous, next) {
    if (previous !== next)
        target[key] = next;
}
function copyOptional(target, key, previous, next) {
    if (previous !== next)
        target[key] = next === undefined ? null : next;
}
function copyStructured(target, key, previous, next) {
    if (JSON.stringify(previous) !== JSON.stringify(next))
        target[key] = next;
}
function copyStructuredOptional(target, key, previous, next) {
    if (JSON.stringify(previous) !== JSON.stringify(next))
        target[key] = next === undefined ? null : next;
}
const OPTIONAL_KEYS = ['pending', 'thinking', 'currentTool', 'turnStartTime', 'model', 'context', 'todos', 'goal', 'taskReferenceAvailable', 'notice'];
//# sourceMappingURL=snapshot-patch.js.map