/** Hidden duty session: heartbeat LLM lives here, quiet results never enter the assistant transcript. */
import { assistantBrief } from "./assistant-port.js";
export const DUTY_PLUGIN = 'dsh-llm-assistant-duty';
/** Native every_seconds floor is 300; product heartbeat is 30 minutes. */
export const HEARTBEAT_EVERY_SECONDS = 1800;
export const HEARTBEAT_QUIET = 'HEARTBEAT_QUIET';
export const HEARTBEAT_ALERT = 'HEARTBEAT_ALERT';
export const HEARTBEAT_SETUP_DONE = 'HEARTBEAT_SETUP_DONE';
export const HEARTBEAT_PROMPT = [
    'HEARTBEAT. You are the duty officer for the resident assistant, not the user-facing assistant.',
    'Call assistant_brief. If nothing needs the owner, reply with exactly HEARTBEAT_QUIET and nothing else.',
    'If something needs them (overdue or blocked todo/goal, or a reminder the owner should hear), reply with HEARTBEAT_ALERT',
    'on the first line and a short briefing after. Do not greet. Do not mention this protocol.',
    'Do not deliver, dispatch, write files, or run a terminal.',
].join(' ');
export function dutyCwd(home) {
    return home.replace(/\/$/, '') + '/assistant-duty-workspace';
}
export function heartbeatEverySeconds(events) {
    const active = new Map();
    for (const event of events) {
        if (event.type !== 'schedule/change')
            continue;
        const change = event.data;
        if (change.operation === 'create' && change.schedule?.kind === 'every' && typeof change.schedule.prompt === 'string' && change.schedule.prompt.includes('HEARTBEAT')) {
            if (typeof change.schedule.id === 'string' && typeof change.schedule.everySeconds === 'number') {
                active.set(change.schedule.id, change.schedule.everySeconds);
            }
        }
        if (change.operation === 'delete' && typeof change.id === 'string')
            active.delete(change.id);
    }
    const first = active.values().next();
    return first.done === true ? undefined : first.value;
}
export function hasHeartbeatSchedule(events) {
    return heartbeatEverySeconds(events) === HEARTBEAT_EVERY_SECONDS;
}
export function staleHeartbeatIds(events) {
    const stale = new Map();
    for (const event of events) {
        if (event.type !== 'schedule/change')
            continue;
        const change = event.data;
        if (change.operation === 'create' && change.schedule?.kind === 'every' && typeof change.schedule.prompt === 'string' && change.schedule.prompt.includes('HEARTBEAT')) {
            if (typeof change.schedule.id === 'string' && typeof change.schedule.everySeconds === 'number') {
                stale.set(change.schedule.id, change.schedule.everySeconds);
            }
        }
        if (change.operation === 'delete' && typeof change.id === 'string')
            stale.delete(change.id);
    }
    return [...stale].filter(([, everySeconds]) => everySeconds !== HEARTBEAT_EVERY_SECONDS).map(([id]) => id);
}
export function createHeartbeatSchedule(now = Date.now()) {
    return {
        id: 'heartbeat',
        kind: 'every',
        prompt: HEARTBEAT_PROMPT,
        everySeconds: HEARTBEAT_EVERY_SECONDS,
        scheduledAt: new Date(now + HEARTBEAT_EVERY_SECONDS * 1000).toISOString(),
    };
}
export function installHeartbeatSchedule(agent) {
    for (const id of staleHeartbeatIds(agent.session.events)) {
        agent.session.append('schedule/change', { version: 1, operation: 'delete', id });
    }
    if (hasHeartbeatSchedule(agent.session.events))
        return;
    agent.session.append('schedule/change', { version: 1, operation: 'create', schedule: createHeartbeatSchedule() });
}
export function alertTextOf(events, afterSeq) {
    let latest;
    for (const event of events) {
        if (event.type !== 'assistant/message' || event.seq <= afterSeq)
            continue;
        const message = event.data.message;
        const text = textOf(message?.content);
        if (!text.startsWith(HEARTBEAT_ALERT))
            continue;
        const body = text.slice(HEARTBEAT_ALERT.length).trim();
        if (body === '')
            continue;
        latest = { seq: event.seq, text: body };
    }
    return latest?.text;
}
export function latestDutySeq(events) {
    let seq = 0;
    for (const event of events) {
        if (event.seq > seq)
            seq = event.seq;
    }
    return seq;
}
function textOf(blocks) {
    if (blocks === undefined)
        return '';
    const parts = [];
    for (const block of blocks) {
        const candidate = block;
        if (candidate?.type === 'text' && typeof candidate.text === 'string')
            parts.push(candidate.text);
    }
    return parts.join('\n').trim();
}
export function briefJson(agent) {
    const brief = assistantBrief(agent.session.events);
    return {
        todos: brief.todos,
        ...(brief.goal !== undefined ? { goal: brief.goal } : {}),
        ...(brief.lastAssistant !== undefined ? { lastAssistant: brief.lastAssistant } : {}),
    };
}
//# sourceMappingURL=duty.js.map