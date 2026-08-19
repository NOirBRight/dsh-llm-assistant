/** Host-side assistant session rollover: bounded handoff and migration orchestration. */
import type { AssistantSnapshot } from './contract.ts';
export declare function buildSessionHandoff(snapshot: AssistantSnapshot): string;
export interface RolloverSession {
    readonly id: string;
    readonly events: readonly unknown[];
    readonly header: {
        readonly seedLength?: number;
        readonly cwd?: string;
    };
    append(type: string, data: unknown): unknown;
}
export interface RolloverAgent {
    readonly id: string;
    readonly status: string;
    readonly session: RolloverSession;
    inject(message: unknown): void;
    runMaintenance<T>(task: () => Promise<T>): Promise<T>;
}
export interface RolloverAgentHandle {
    readonly agent: RolloverAgent;
    dispose(): Promise<void>;
}
export interface CurrentRolloverSession {
    readonly handle: RolloverAgentHandle;
    readonly snapshot: AssistantSnapshot;
    readonly model: {
        readonly provider: string;
        readonly model: string;
        readonly reasoningEffort?: string;
    };
    readonly archivedSessionIds: readonly string[];
}
export interface RolloverCommit {
    readonly handle: RolloverAgentHandle;
    readonly archivedSessionIds: readonly string[];
}
export interface SessionRolloverDependencies {
    current(): CurrentRolloverSession;
    newSessionId(): string;
    create(sessionId: string, model: CurrentRolloverSession['model']): Promise<RolloverAgentHandle>;
    handoffMessage(text: string): unknown;
    captureSchedules(agent: RolloverAgent): readonly unknown[];
    restoreSchedules(agent: RolloverAgent, records: readonly unknown[]): void;
    retireSchedules(agent: RolloverAgent, records: readonly unknown[]): void;
    flush(agent: RolloverAgent): Promise<void>;
    commit(next: RolloverCommit): void;
    warn(message: string): void;
}
export interface SessionRollover {
    readonly switching: boolean;
    rollover(): Promise<{
        sessionId: string;
    }>;
}
export declare class SessionRolloverError extends Error {
    readonly code: 'busy' | 'switching';
    constructor(code: 'busy' | 'switching', message: string);
}
export declare function createSessionRollover(deps: SessionRolloverDependencies): SessionRollover;
//# sourceMappingURL=session-rollover.d.ts.map