import type { TaskAnchor, TaskReferenceReceipt } from './contract.ts';
import type { TaskReferenceAdapter } from './task-reference.ts';
export interface TaskChoice {
    readonly sessionId: string;
    readonly label: string;
}
export type TaskReferenceToolResult = {
    readonly status: 'referenced';
    readonly task: TaskReferenceReceipt;
    readonly context: string;
} | {
    readonly status: 'choose';
    readonly candidates: readonly TaskChoice[];
} | {
    readonly status: 'unavailable';
    readonly reason: string;
};
export interface TaskReferenceToolDependencies {
    readonly currentTask: () => TaskAnchor | undefined;
    readonly adapter: () => TaskReferenceAdapter | undefined;
    readonly findTasks: (query: string, agent: unknown) => Promise<readonly TaskChoice[]>;
}
export interface TaskReferenceToolDefinition {
    readonly name: 'task_reference';
    readonly description: string;
    readonly parameters: Record<string, unknown>;
    readonly output: {
        readonly schema: Record<string, unknown>;
        render(args: unknown, value: TaskReferenceToolResult): {
            type: 'text';
            text: string;
        }[];
    };
    execute(args: unknown, exec: {
        readonly agent: unknown;
    }): Promise<TaskReferenceToolResult>;
}
export declare function createTaskReferenceToolDefinition(deps: TaskReferenceToolDependencies): TaskReferenceToolDefinition;
//# sourceMappingURL=task-reference-tool.d.ts.map