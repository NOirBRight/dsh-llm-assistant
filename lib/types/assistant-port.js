/**
 * Host-side assistant port: projects the assistant session log into the wire
 * snapshot and drives user messages into the session (T1.2).
 */
const TASK_REFERENCE_PLUGIN = 'dsh-llm-assistant:task-reference';
/** Compact status for the duty heartbeat — todos/goal/last visible assistant line. */
export function assistantBrief(events) {
    const projected = project(events);
    const last = [...projected.items].reverse().find((item) => item.kind === 'assistant' && item.text.trim() !== '');
    return {
        todos: projected.todos,
        goal: projected.goal,
        lastAssistant: last !== undefined && last.kind === 'assistant' ? last.text.slice(0, 400) : undefined,
    };
}
export function createAssistantPort(agent, api, revision, chrome = () => ({}), attachments, taskReferences) {
    return {
        snapshot() {
            const projected = project(agent.session.events);
            const status = agent.status === 'running' ? 'running' : 'idle';
            const extra = chrome();
            return {
                sessionId: agent.id,
                seq: agent.session.seq,
                status,
                messages: projected.messages,
                items: projected.items,
                revision: revision(),
                ...(projected.pending !== '' ? { pending: projected.pending } : {}),
                ...(projected.thinking !== '' ? { thinking: projected.thinking } : {}),
                ...(status === 'running' && projected.currentTool !== undefined ? { currentTool: projected.currentTool } : {}),
                ...(extra.model !== undefined ? { model: extra.model } : {}),
                ...(projected.context !== undefined ? { context: projected.context } : {}),
                ...(projected.todos.length > 0 ? { todos: projected.todos } : {}),
                ...(projected.goal !== undefined ? { goal: projected.goal } : {}),
                taskReferenceAvailable: taskReferences !== undefined,
            };
        },
        async send(text, images, task) {
            const trimmed = text.trim();
            const incoming = images ?? [];
            if (trimmed === '' && incoming.length === 0)
                return { sent: false, error: 'empty message' };
            try {
                const content = [];
                if (trimmed !== '')
                    content.push({ type: 'text', text: trimmed });
                for (const image of incoming) {
                    if (attachments === undefined)
                        return { sent: false, error: 'attachments service is not available' };
                    const mediaType = asImageMediaType(image.mediaType);
                    if (mediaType === undefined)
                        return { sent: false, error: 'unsupported image type: ' + image.mediaType };
                    const data = Uint8Array.from(Buffer.from(image.dataBase64, 'base64'));
                    const attachment = await attachments.saveImage({
                        data,
                        mediaType,
                        name: image.name,
                    });
                    content.push({ type: 'image', attachment });
                }
                let outgoing = content;
                let receipt;
                if (task !== undefined) {
                    if (taskReferences === undefined)
                        return { sent: false, error: '任务引用功能不可用' };
                    const previous = latestTaskReceipt(agent.session.events);
                    if (task.refresh !== true && previous !== undefined && (previous.taskId === task.anchor.sessionId || previous.sourceSessionIds.includes(task.anchor.sessionId))) {
                        receipt = previous;
                    }
                    else {
                        const prepared = await taskReferences.prepare({ agent, content, anchorSessionId: task.anchor.sessionId });
                        outgoing = prepared.content;
                        receipt = prepared.receipt;
                        agent.inject(api.createUserMessage({
                            content: [{ type: 'text', text: JSON.stringify(prepared.receipt) }],
                            source: { kind: 'plugin', plugin: TASK_REFERENCE_PLUGIN },
                        }));
                        if (prepared.additionalContext !== undefined)
                            agent.inject(prepared.additionalContext);
                    }
                }
                agent.followup(api.createUserMessage({ content: outgoing, source: { kind: 'user' } }));
                return { sent: true, ...(receipt === undefined ? {} : { task: receipt }) };
            }
            catch (error) {
                return { sent: false, error: error instanceof Error ? error.message : String(error) };
            }
        },
        async readImage(attachmentId) {
            if (attachments === undefined)
                return undefined;
            const ref = findImageRef(agent.session.events, attachmentId);
            if (ref === undefined)
                return undefined;
            const stored = await attachments.readImage(ref);
            return { mediaType: stored.ref.mediaType, dataBase64: Buffer.from(stored.data).toString('base64') };
        },
        sessionHasImages() {
            return findImageRef(agent.session.events) !== undefined;
        },
    };
}
function project(events) {
    const messages = [];
    const items = [];
    const tools = new Map();
    let pendingParts = [];
    let thinkingParts = [];
    let currentTool;
    let todos = [];
    let goal;
    let messageChars = 0;
    let toolChars = 0;
    for (const event of events) {
        const data = event.data;
        if (event.type === 'turn/start' || event.type === 'step/start') {
            pendingParts = [];
            thinkingParts = [];
        }
        else if (event.type === 'assistant/message') {
            const message = data.message;
            const text = textOfBlocks(message?.content);
            if (text !== '') {
                const item = { kind: 'assistant', seq: event.seq, text, time: event.time };
                items.push(item);
                messages.push({ seq: event.seq, role: 'assistant', text, source: 'model', time: event.time });
                messageChars += text.length;
            }
            pendingParts = [];
        }
        else if (event.type === 'assistant/chunk') {
            const chunk = data.chunk;
            if (chunk?.type === 'text-delta' && typeof chunk.text === 'string') {
                pendingParts.push(chunk.text);
            }
            else if (chunk?.type === 'reasoning-delta' && typeof chunk.text === 'string') {
                thinkingParts.push(chunk.text);
            }
            else if (chunk?.type === 'tool-call-delta' && typeof chunk.name === 'string') {
                currentTool = chunk.name;
            }
            else if (chunk?.type === 'finish' && chunk.reason?.kind === 'error') {
                const text = typeof chunk.reason.failure?.message === 'string'
                    ? chunk.reason.failure.message
                    : typeof chunk.reason.error?.message === 'string'
                        ? chunk.reason.error.message
                        : '模型请求失败';
                items.push({ kind: 'error', seq: event.seq, text });
                pendingParts = [];
                thinkingParts = [];
            }
        }
        else if (event.type === 'user/message') {
            const source = data.source;
            if (source?.kind === 'plugin' && source.plugin === TASK_REFERENCE_PLUGIN) {
                const receipt = taskReceiptMessage(data);
                if (receipt !== undefined)
                    items.push({ kind: 'task-reference', seq: event.seq, receipt });
            }
            else if (source?.kind === 'user') {
                const text = textOfBlocks(data.content);
                const images = imageRefsOf(data.content);
                if (text !== '' || images.length > 0) {
                    const item = {
                        kind: 'user',
                        seq: event.seq,
                        text,
                        time: event.time,
                        source: sourceLabel(data.source),
                        ...(images.length > 0 ? { images } : {}),
                    };
                    items.push(item);
                    messages.push({ seq: event.seq, role: 'user', text, source: item.source, time: event.time });
                    messageChars += text.length;
                }
            }
        }
        else if (event.type === 'tool/call') {
            const name = typeof data.name === 'string' ? data.name : 'tool';
            currentTool = name;
            const callId = callIdOf(data);
            const summary = summarizeArgs(data.arguments ?? data.args);
            const item = { kind: 'tool', seq: event.seq, name, status: 'running', summary };
            tools.set(callId, item);
            items.push(item);
            toolChars += summary.length + name.length;
            const nextTodos = todosFromTool(name, data.arguments ?? data.args);
            if (nextTodos !== undefined)
                todos = nextTodos;
            const nextGoal = goalFromTool(name, data.arguments ?? data.args);
            if (nextGoal !== undefined)
                goal = nextGoal;
        }
        else if (event.type === 'tool/result') {
            const callId = resultCallIdOf(data);
            const existing = tools.get(callId);
            if (existing !== undefined) {
                const isError = data.isError === true;
                const updated = {
                    ...existing,
                    status: isError ? 'error' : 'done',
                    summary: existing.summary !== '' ? existing.summary : summarizeResult(data),
                };
                tools.set(callId, updated);
                const index = items.findIndex((entry) => entry.kind === 'tool' && entry.seq === existing.seq);
                if (index >= 0)
                    items[index] = updated;
            }
        }
        else if (event.type === 'turn/end') {
            currentTool = undefined;
            const reason = data.reason;
            const errorText = reason?.kind === 'error' && typeof reason.error?.message === 'string' ? reason.error.message : undefined;
            if (errorText !== undefined) {
                const already = items.some((item) => item.kind === 'error' && item.text === errorText);
                if (!already)
                    items.push({ kind: 'error', seq: event.seq, text: errorText });
            }
            pendingParts = [];
            thinkingParts = [];
        }
    }
    const used = Math.max(1, Math.round((messageChars + toolChars) / 4));
    const cap = 128_000;
    const context = {
        used: Math.min(used, cap),
        cap,
        system: 0,
        tools: Math.round(toolChars / 4),
        messages: Math.round(messageChars / 4),
    };
    return { messages, items, pending: pendingParts.join(''), thinking: thinkingParts.join(''), currentTool, context, todos, goal };
}
function textOfBlocks(blocks) {
    if (blocks === undefined)
        return '';
    const out = [];
    for (const block of blocks) {
        const candidate = block;
        if (candidate?.type === 'text' && typeof candidate.text === 'string')
            out.push(candidate.text);
    }
    return out.join('');
}
function imageRefsOf(blocks) {
    if (blocks === undefined)
        return [];
    const images = [];
    for (const block of blocks) {
        const candidate = block;
        const attachment = candidate?.attachment;
        if (candidate?.type !== 'image' || attachment === undefined)
            continue;
        if (typeof attachment.attachmentId !== 'string' || typeof attachment.mediaType !== 'string')
            continue;
        images.push({
            attachmentId: attachment.attachmentId,
            mediaType: attachment.mediaType,
            ...(typeof attachment.name === 'string' ? { name: attachment.name } : {}),
        });
    }
    return images;
}
function asImageMediaType(value) {
    if (value === 'image/png' || value === 'image/jpeg' || value === 'image/webp' || value === 'image/gif')
        return value;
    if (value === 'image/jpg')
        return 'image/jpeg';
    return undefined;
}
function findImageRef(events, attachmentId) {
    for (const event of events) {
        const content = event.type === 'user/message'
            ? event.data.content
            : event.type === 'assistant/message'
                ? event.data.message?.content
                : undefined;
        if (!Array.isArray(content))
            continue;
        for (const block of content) {
            const candidate = block;
            if (candidate?.type !== 'image' || candidate.attachment === undefined)
                continue;
            if (attachmentId === undefined || candidate.attachment.attachmentId === attachmentId)
                return candidate.attachment;
        }
    }
    return undefined;
}
function isRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function latestTaskReceipt(events) {
    for (let index = events.length - 1; index >= 0; index -= 1) {
        const event = events[index];
        if (event?.type === 'user/message') {
            const receipt = taskReceiptMessage(event.data);
            if (receipt !== undefined)
                return receipt;
        }
    }
    return undefined;
}
function taskReceiptMessage(data) {
    const source = data.source;
    if (source?.kind !== 'plugin' || source.plugin !== TASK_REFERENCE_PLUGIN)
        return undefined;
    const text = textOfBlocks(data.content);
    try {
        return taskReceiptOf(JSON.parse(text));
    }
    catch {
        return undefined;
    }
}
function taskReceiptOf(value) {
    if (!isRecord(value) || typeof value.taskId !== 'string' || typeof value.label !== 'string')
        return undefined;
    if (!Number.isSafeInteger(value.totalSessions) || !Number.isSafeInteger(value.omittedSessions))
        return undefined;
    if (!Array.isArray(value.sourceSessionIds) || !value.sourceSessionIds.every((id) => typeof id === 'string'))
        return undefined;
    return {
        taskId: value.taskId,
        label: value.label,
        totalSessions: value.totalSessions,
        omittedSessions: value.omittedSessions,
        sourceSessionIds: value.sourceSessionIds,
    };
}
function sourceLabel(source) {
    const candidate = source;
    if (candidate?.kind === 'plugin' && typeof candidate.plugin === 'string')
        return 'plugin:' + candidate.plugin;
    if (typeof candidate?.kind === 'string')
        return candidate.kind;
    return 'unknown';
}
function callIdOf(data) {
    if (typeof data.id === 'string')
        return data.id;
    if (typeof data.callId === 'string')
        return data.callId;
    return 'seq:' + String(data.seq ?? Math.random());
}
function resultCallIdOf(data) {
    if (typeof data.toolCallId === 'string')
        return data.toolCallId;
    if (typeof data.callId === 'string')
        return data.callId;
    if (typeof data.id === 'string')
        return data.id;
    return '';
}
function summarizeArgs(value) {
    if (typeof value === 'string') {
        try {
            return summarizeArgs(JSON.parse(value));
        }
        catch {
            return clip(value, 80);
        }
    }
    if (!isObject(value))
        return '';
    const command = value.command;
    if (typeof command === 'string')
        return clip(command, 80);
    const path = value.path ?? value.file_path ?? value.filePath;
    if (typeof path === 'string')
        return clip(path, 80);
    const title = value.title ?? value.name ?? value.query;
    if (typeof title === 'string')
        return clip(title, 80);
    const keys = Object.keys(value);
    return keys.length === 0 ? '' : clip(keys.join(', '), 80);
}
function summarizeResult(data) {
    if (data.isError === true)
        return 'failed';
    return 'done';
}
function todosFromTool(name, raw) {
    if (!/todo/i.test(name))
        return undefined;
    const args = parseArgs(raw);
    if (args === undefined)
        return undefined;
    const list = args.todos;
    if (!Array.isArray(list))
        return undefined;
    const todos = [];
    for (const [index, entry] of list.entries()) {
        if (!isObject(entry) || typeof entry.content !== 'string')
            continue;
        const status = entry.status === 'completed' || entry.status === 'in_progress' ? entry.status : 'pending';
        const id = typeof entry.id === 'string' && entry.id !== '' ? entry.id : 'todo-' + String(index);
        todos.push({ id, content: entry.content, status });
    }
    return todos;
}
function goalFromTool(name, raw) {
    if (!/goal/i.test(name))
        return undefined;
    const args = parseArgs(raw);
    if (args === undefined)
        return undefined;
    const title = typeof args.title === 'string' ? args.title : typeof args.objective === 'string' ? args.objective : undefined;
    if (title === undefined)
        return undefined;
    const status = typeof args.status === 'string' ? args.status : typeof args.phase === 'string' ? args.phase : 'active';
    return { title, status };
}
function parseArgs(raw) {
    if (typeof raw === 'string') {
        try {
            const parsed = JSON.parse(raw);
            return isObject(parsed) ? parsed : undefined;
        }
        catch {
            return undefined;
        }
    }
    return isObject(raw) ? raw : undefined;
}
function isObject(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function clip(text, max) {
    const flat = text.replace(/\s+/g, ' ').trim();
    return flat.length <= max ? flat : flat.slice(0, max - 1) + '…';
}
//# sourceMappingURL=assistant-port.js.map