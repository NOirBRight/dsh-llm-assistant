/** Decode assistant seat RPC and run it against the host's assistant port. */
import { type RpcResult, type TaskAnchor } from './contract.ts';
import type { AssistantPort } from './assistant-port.ts';
export interface AssistantRpcExtras {
    readonly setModel?: (model: string, effort?: string, provider?: string) => Promise<RpcResult<unknown>>;
    readonly imageCapable?: () => boolean;
    readonly rollover?: () => Promise<RpcResult<{
        readonly sessionId: string;
    }>>;
    readonly noteCurrentTask?: (task: TaskAnchor | undefined) => void;
}
export declare function handleAssistantRpc(port: AssistantPort, endpoint: string, payload: unknown, extras?: AssistantRpcExtras): Promise<RpcResult<unknown>>;
//# sourceMappingURL=host-rpc.d.ts.map