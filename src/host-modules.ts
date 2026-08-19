import { realpathSync } from 'node:fs'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

/**
 * Load a host DSH package from the running CLI. rc.8's checkout CLI does not
 * re-export every workspace package from `apps/cli`, so fall back through
 * `@deepseek-ai/dsh-agent` (which still depends on scope/tools/etc).
 */
export function createHostModuleLoader(entry = process.argv[1]): ((id: string) => Promise<unknown>) | undefined {
  if (entry === undefined) return undefined
  const cli = realpathSync(entry)
  const roots = [cli]
  try {
    roots.push(createRequire(cli).resolve('@deepseek-ai/dsh-agent'))
  } catch {
    /* CLI may not expose agent as a direct dependency */
  }
  return async (id: string) => {
    let last: unknown
    for (const root of roots) {
      try {
        return await import(pathToFileURL(createRequire(root).resolve(id)).href)
      } catch (error) {
        last = error
      }
    }
    throw last instanceof Error ? last : new Error(`cannot resolve ${id}`)
  }
}
