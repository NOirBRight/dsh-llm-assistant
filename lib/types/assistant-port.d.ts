/**
 * Host-side assistant port: projects the assistant session log into the wire
 * snapshot and drives user messages into the session (T1.2).
 */
import type { AssistantSnapshot, GoalItem, ModelChrome, SendImage, SendReply, TaskAnchor, TaskReferenceReceipt, TodoItem } from './contract.ts';
/** Host view of the live assistant agent (subset of dsh-agent's Agent). */
export interface AssistantAgentView {
    readonly id: string;
    readonly status: string;
    readonly session: AssistantSessionView;
    followup(message: unknown): void;
    inject(message: unknown): void;
    runMaintenance<T>(task: () => Promise<T>): Promise<T>;
}
export interface AssistantSessionView {
    readonly id: string;
    readonly seq: number;
    readonly header: {
        readonly cwd?: string;
        readonly seedLength?: number;
    };
    readonly events: readonly AssistantEvent[];
    append(type: string, data: unknown): unknown;
}
export interface AssistantEvent {
    readonly type: string;
    readonly seq: number;
    readonly time: number;
    readonly data: Record<string, unknown>;
}
/** Runtime-resolved helpers (SessionId brand + createUserMessage). */
export interface AssistantRuntimeApi {
    readonly SessionId: (id: string) => string;
    readonly installModelSelection?: (agentCtx: {
        on: (name: string, listener: (...args: never[]) => unknown) => unknown;
    }, selection: {
        current: {
            provider: string;
            model: string;
            reasoningEffort?: string;
        } | undefined;
        assembled: unknown;
    }) => () => void;
    readonly foldScheduleEvents?: import('./schedule-migration.ts').FoldScheduleEvents;
    readonly createUserMessage: (input: {
        readonly content: readonly ({
            readonly type: 'text';
            readonly text: string;
        } | {
            readonly type: 'image';
            readonly attachment: ImageAttachmentRef;
        })[];
        readonly source: {
            readonly kind: 'user';
        } | {
            readonly kind: 'plugin';
            readonly plugin: string;
        };
    }) => unknown;
}
export interface ImageAttachmentRef {
    readonly attachmentId: string;
    readonly mediaType: string;
    readonly bytes: number;
    readonly width: number;
    readonly height: number;
    readonly name?: string;
}
export interface AttachmentStoreView {
    saveImage(input: {
        data: Uint8Array;
        mediaType: 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif';
        name?: string;
    }): Promise<ImageAttachmentRef>;
    readImage(ref: ImageAttachmentRef): Promise<{
        ref: ImageAttachmentRef;
        data: Uint8Array;
    }>;
}
export interface AssistantChrome {
    readonly model?: ModelChrome;
}
export interface TaskReferencePort {
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
export interface AssistantPort {
    snapshot(): AssistantSnapshot;
    send(text: string, images?: readonly SendImage[], task?: {
        readonly anchor: TaskAnchor;
        readonly refresh?: boolean;
    }): Promise<SendReply>;
    readImage(attachmentId: string): Promise<{
        mediaType: string;
        dataBase64: string;
    } | undefined>;
    sessionHasImages(): boolean;
}
/** Compact status for the duty heartbeat — todos/goal/last visible assistant line. */
export declare function assistantBrief(events: readonly AssistantEvent[]): {
    todos: readonly TodoItem[];
    goal: GoalItem | undefined;
    lastAssistant: string | undefined;
};
export declare function createAssistantPort(agent: AssistantAgentView, api: AssistantRuntimeApi, revision: () => number, chrome?: () => AssistantChrome, attachments?: AttachmentStoreView, taskReferences?: TaskReferencePort): AssistantPort;
//# sourceMappingURL=assistant-port.d.ts.map