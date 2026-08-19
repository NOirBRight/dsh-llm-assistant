/** Exact-record migration adapter for agent-scoped durable schedules. */
export function captureActiveSchedules(agent, fold) {
    const active = fold(agent.session.events, agent.session.header.seedLength ?? 0).active;
    for (const record of active) {
        if (typeof record.id !== 'string' || record.id.trim() === '')
            throw new Error('schedule fold returned a record without an id');
    }
    return [...active];
}
export function restoreActiveSchedules(agent, records) {
    for (const schedule of records) {
        agent.session.append('schedule/change', { version: 1, operation: 'create', schedule });
    }
}
export function retireActiveSchedules(agent, records) {
    for (const record of records) {
        agent.session.append('schedule/change', { version: 1, operation: 'delete', id: record.id });
    }
}
//# sourceMappingURL=schedule-migration.js.map