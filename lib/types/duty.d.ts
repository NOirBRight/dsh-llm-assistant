/** Hidden duty session: heartbeat LLM lives here, quiet results never enter the assistant transcript. */
import { type AssistantAgentView, type AssistantEvent } from './assistant-port.ts';
/** Lab test floor: native every_seconds minimum is 300. Restore 1800 after testing. */
export declare const HEARTBEAT_EVERY_SECONDS = 300;
export declare const HEARTBEAT_QUIET = "HEARTBEAT_QUIET";
export declare const HEARTBEAT_ALERT = "HEARTBEAT_ALERT";
export declare const HEARTBEAT_SETUP_DONE = "HEARTBEAT_SETUP_DONE";
export declare const HEARTBEAT_PROMPT: string;
export declare function dutyCwd(home: string): string;
export declare function heartbeatEverySeconds(events: readonly AssistantEvent[]): number | undefined;
export declare function hasHeartbeatSchedule(events: readonly AssistantEvent[]): boolean;
export declare function alertTextOf(events: readonly AssistantEvent[], afterSeq: number): string | undefined;
export declare function latestDutySeq(events: readonly AssistantEvent[]): number;
export declare function briefJson(agent: AssistantAgentView): Record<string, unknown>;
//# sourceMappingURL=duty.d.ts.map