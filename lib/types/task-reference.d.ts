/** Resolve one cross-session task into bounded official session references. */
import type { TaskReferenceReceipt } from './contract.ts';
export interface TaskSessionRecord {
    readonly header: {
        readonly id: string;
        readonly createdAt: number;
        readonly parentSession?: string;
        readonly origin?: 'subagent';
    };
    readonly live: boolean;
    readonly persisted: boolean;
}
export interface TaskLineageNode {
    readonly session: TaskSessionRecord;
    readonly descendants: readonly TaskLineageNode[];
}
export type TaskLineageTrace = {
    readonly target: TaskSessionRecord;
    readonly ancestors: readonly TaskSessionRecord[];
    readonly descendants: readonly TaskLineageNode[];
} & ({
    readonly complete: true;
    readonly root: TaskSessionRecord;
} | {
    readonly complete: false;
    readonly unresolvedParentId: string;
});
export interface TaskReferenceDependencies {
    traceSession(sessionId: string): Promise<TaskLineageTrace>;
    readSurface(sessionId: string): Promise<{
        readonly capturedThroughSeq: number | null;
        readonly events: readonly {
            readonly time?: number;
        }[];
    }>;
    readTitle(sessionId: string): Promise<{
        readonly title?: string;
    } | undefined>;
    prepare(agent: unknown, content: readonly unknown[], references: readonly {
        readonly sessionId: string;
        readonly label?: string;
    }[]): Promise<{
        readonly content: readonly unknown[];
        readonly additionalContext?: unknown;
    }>;
    deniedSessionIds(): readonly string[];
}
export interface TaskReferenceAdapter {
    prepare(input: {
        readonly agent: unknown;
        readonly content: readonly unknown[];
        readonly anchorSessionId: string;
    }): Promise<{
        readonly content: readonly unknown[];
        readonly additionalContext?: unknown;
        readonly receipt: TaskReferenceReceipt;
    }>;
}
export declare function createTaskReferenceAdapter(deps: TaskReferenceDependencies): TaskReferenceAdapter;
//# sourceMappingURL=task-reference.d.ts.map