/**
 * Load a host DSH package from the running CLI. rc.8's checkout CLI does not
 * re-export every workspace package from `apps/cli`, so fall back through
 * `@deepseek-ai/dsh-agent` (which still depends on scope/tools/etc).
 */
export declare function createHostModuleLoader(entry?: string | undefined): ((id: string) => Promise<unknown>) | undefined;
//# sourceMappingURL=host-modules.d.ts.map