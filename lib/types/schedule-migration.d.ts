/** Exact-record migration adapter for agent-scoped durable schedules. */
export interface ScheduleRecord {
    readonly id: string;
    readonly [key: string]: unknown;
}
export interface ScheduleAgentView {
    readonly session: {
        readonly events: readonly unknown[];
        readonly header: {
            readonly seedLength?: number;
        };
        append(type: string, data: unknown): unknown;
    };
}
export type FoldScheduleEvents = (events: readonly unknown[], seedLength?: number) => {
    readonly active: readonly ScheduleRecord[];
};
export declare function captureActiveSchedules(agent: ScheduleAgentView, fold: FoldScheduleEvents): readonly ScheduleRecord[];
export declare function restoreActiveSchedules(agent: ScheduleAgentView, records: readonly ScheduleRecord[]): void;
export declare function retireActiveSchedules(agent: ScheduleAgentView, records: readonly ScheduleRecord[]): void;
//# sourceMappingURL=schedule-migration.d.ts.map