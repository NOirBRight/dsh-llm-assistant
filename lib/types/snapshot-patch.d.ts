import type { AssistantSnapshot, ContextChrome, GoalItem, ModelChrome, TimelineItem, TodoItem, AssistantMessage } from './contract.ts';
export interface AssistantSnapshotPatch {
    readonly sessionId?: string;
    readonly seq?: number;
    readonly revision?: number;
    readonly status?: AssistantSnapshot['status'];
    readonly messages?: readonly AssistantMessage[];
    readonly items?: readonly TimelineItem[];
    readonly pending?: string | null;
    readonly thinking?: string | null;
    readonly currentTool?: string | null;
    readonly turnStartTime?: number | null;
    readonly model?: ModelChrome | null;
    readonly context?: ContextChrome | null;
    readonly todos?: readonly TodoItem[] | null;
    readonly goal?: GoalItem | null;
    readonly taskReferenceAvailable?: boolean | null;
    readonly notice?: string | null;
}
export type AssistantLiveDelta = {
    readonly kind: 'text';
    readonly text: string;
} | {
    readonly kind: 'reasoning';
    readonly text: string;
} | {
    readonly kind: 'tool';
    readonly name: string;
};
export type AssistantStreamFrame = {
    readonly type: 'snapshot';
    readonly snapshot: AssistantSnapshot;
} | {
    readonly type: 'patch';
    readonly patch: AssistantSnapshotPatch;
} | {
    readonly type: 'delta';
    readonly seq: number;
    readonly revision: number;
    readonly delta: AssistantLiveDelta;
};
export declare function diffAssistantSnapshot(previous: AssistantSnapshot, next: AssistantSnapshot): AssistantSnapshotPatch;
export declare function applyAssistantSnapshotPatch(snapshot: AssistantSnapshot, patch: AssistantSnapshotPatch): AssistantSnapshot;
export declare function applyAssistantLiveDelta(snapshot: AssistantSnapshot, delta: AssistantLiveDelta, seq: number, revision: number): AssistantSnapshot;
export declare function applyAssistantStreamFrame(snapshot: AssistantSnapshot | undefined, frame: AssistantStreamFrame): AssistantSnapshot | undefined;
//# sourceMappingURL=snapshot-patch.d.ts.map