/**
 * rc.8 web-app already mounts `session-reference`. The assistant patch must
 * not insert the same loader id. rc.7 still needs the service, so mount it
 * at runtime only when the tree does not already have it.
 */

export const SESSION_REFERENCE_BUDGET = {
  maxReferences: 3,
  maxReferenceBytes: 65_536,
} as const

export interface SessionReferenceHost {
  get(name: string): unknown
  plugin(plugin: unknown, config?: unknown): Promise<unknown> | unknown
}

export async function ensureSessionReference(
  ctx: SessionReferenceHost,
  load: (id: string) => Promise<unknown>,
): Promise<'present' | 'mounted'> {
  if (ctx.get('sessionReferenceResolver') !== undefined) return 'present'
  const loaded = await load('@deepseek-ai/dsh-session-reference')
  const plugin = sessionReferencePluginOf(loaded)
  if (plugin === undefined) {
    throw new Error('@deepseek-ai/dsh-session-reference exported neither a plugin nor a default')
  }
  await ctx.plugin(plugin, { ...SESSION_REFERENCE_BUDGET })
  return 'mounted'
}

function sessionReferencePluginOf(loaded: unknown): unknown {
  if (typeof loaded === 'function') return loaded
  if (typeof loaded !== 'object' || loaded === null) return undefined
  const record = loaded as { default?: unknown; apply?: unknown }
  if (typeof record.default === 'function') return record.default
  if (typeof record.apply === 'function') return loaded
  return undefined
}
