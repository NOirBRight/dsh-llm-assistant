/** Hidden duty session: heartbeat LLM lives here, quiet results never enter the assistant transcript. */
import { type AssistantAgentView, type AssistantEvent } from './assistant-port.ts';
export declare const DUTY_PLUGIN = "dsh-llm-assistant-duty";
/** Native every_seconds floor is 300; product heartbeat is 30 minutes. */
export declare const HEARTBEAT_EVERY_SECONDS = 1800;
export declare const HEARTBEAT_QUIET = "HEARTBEAT_QUIET";
export declare const HEARTBEAT_ALERT = "HEARTBEAT_ALERT";
export declare const HEARTBEAT_SETUP_DONE = "HEARTBEAT_SETUP_DONE";
export declare const HEARTBEAT_SCHEDULE_ID = "heartbeat";
/** Replace a duty session before it can be resumed as a live root. */
export declare const DUTY_MAX_TURNS = 20;
export declare const DUTY_MAX_SEQ = 80;
export declare const DUTY_MAX_EVENT_BYTES: number;
export declare const DUTY_QUIET_ROTATE_TURNS = 2;
export declare const HEARTBEAT_PROMPT: string;
export declare function dutyCwd(home: string): string;
export interface HeartbeatRecord {
    readonly id: string;
    readonly everySeconds: number;
    readonly prompt: string;
}
export declare function foldEverySchedules(events: readonly AssistantEvent[]): Map<string, HeartbeatRecord>;
export declare function heartbeatEverySeconds(events: readonly AssistantEvent[]): number | undefined;
export declare function hasHeartbeatSchedule(events: readonly AssistantEvent[]): boolean;
export declare function staleHeartbeatIds(events: readonly AssistantEvent[]): string[];
export declare function createHeartbeatSchedule(now?: number): {
    readonly id: string;
    readonly kind: 'every';
    readonly prompt: string;
    readonly everySeconds: number;
    readonly scheduledAt: string;
};
export declare function installHeartbeatSchedule(agent: {
    readonly session: {
        readonly events: readonly AssistantEvent[];
        append(type: string, data: unknown): unknown;
    };
}): void;
export declare function countDutyTurns(events: readonly AssistantEvent[]): number;
export declare function dutySessionIsOversized(events: readonly AssistantEvent[]): boolean;
export declare function shouldReplaceDutySession(events: readonly AssistantEvent[]): boolean;
export declare function lastAssistantText(events: readonly AssistantEvent[]): string | undefined;
export declare function shouldRotateDutyAfterQuiet(events: readonly AssistantEvent[]): boolean;
export declare function isDutyRelayEvent(type: string): boolean;
export declare function dutyRelayDecision(events: readonly AssistantEvent[], cursor: number, eventType: string): {
    readonly alert: string | undefined;
    readonly cursor: number;
} | undefined;
export declare function alertTextOf(events: readonly AssistantEvent[], afterSeq: number): string | undefined;
export declare function latestDutySeq(events: readonly AssistantEvent[]): number;
export declare function bootDutyRelayCursor(events: readonly AssistantEvent[], persisted: number | undefined): number;
export declare function briefJson(agent: AssistantAgentView): Record<string, unknown>;
//# sourceMappingURL=duty.d.ts.map