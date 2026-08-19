/**
 * rc.8 web-app already mounts `session-reference`. The assistant patch must
 * not insert the same loader id. rc.7 still needs the service, so mount it
 * at runtime only when the tree does not already have it.
 */
export declare const SESSION_REFERENCE_BUDGET: {
    readonly maxReferences: 3;
    readonly maxReferenceBytes: 65536;
};
export interface SessionReferenceHost {
    get(name: string): unknown;
    plugin(plugin: unknown, config?: unknown): Promise<unknown> | unknown;
}
export declare function ensureSessionReference(ctx: SessionReferenceHost, load: (id: string) => Promise<unknown>): Promise<'present' | 'mounted'>;
//# sourceMappingURL=session-reference-boot.d.ts.map