import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, vi } from 'vitest'

import {
  ASSISTANT_PRESET_EXPECTED_TOOLS,
  ASSISTANT_PRESET_FORBIDDEN_ROWS,
  ASSISTANT_PRESET_ID,
  ASSISTANT_PRESET_ROWS,
  createAssistantPreset,
  joinStandingScope,
} from '../src/assistant-preset.ts'

const composition = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '../presets/llm-assistant/agent.cordis.yml'),
  'utf8',
)

describe('assistant private preset', () => {
  it('ships a narrow composition without worker or construction rows', () => {
    const ids = ASSISTANT_PRESET_ROWS.map((row) => row.id)
    expect(ids).toEqual(['tool-web', 'tool-fs', 'tool-fs-search', 'tool-todo', 'tool-goal'])
    expect(ASSISTANT_PRESET_ID).toBe('llm-assistant')
    expect(ASSISTANT_PRESET_EXPECTED_TOOLS).toContain('web_search')
    for (const forbidden of ASSISTANT_PRESET_FORBIDDEN_ROWS) {
      expect(ids).not.toContain(forbidden)
      expect(composition).not.toContain('id: ' + forbidden)
    }
  })

  it('keeps the checked-in yml in sync with the mounted rows', () => {
    for (const row of ASSISTANT_PRESET_ROWS) {
      expect(composition).toContain('id: ' + row.id)
      expect(composition).toContain(row.name)
    }
  })

  it('joins an agent scope onto the standing key', () => {
    const agentKey = { agent: true }
    const standingKey = { standing: true }
    const binds: unknown[] = []
    const ok = joinStandingScope(
      {
        scopeOf: () => agentKey,
        bindScopeParent: (child, parent) => { binds.push([child, parent]) },
      },
      {},
      standingKey,
    )
    expect(ok).toBe(true)
    expect(binds).toEqual([[agentKey, standingKey]])
  })

  it('does not join an unscoped context', () => {
    const bind = vi.fn()
    expect(joinStandingScope({ scopeOf: () => undefined, bindScopeParent: bind }, {}, {})).toBe(false)
    expect(bind).not.toHaveBeenCalled()
  })

  it('mounts each row once onto a standing scope then joins later agents', async () => {
    const plugins: string[] = []
    const standingCtx = {
      plugin(mod: { name?: string }, config?: unknown) {
        plugins.push(String(mod.name) + ':' + JSON.stringify(config ?? null))
        return { await: async () => undefined }
      },
    }
    const agentKey = { agent: 1 }
    const binds: unknown[] = []
    const load = async (id: string): Promise<unknown> => {
      if (id === '@deepseek-ai/dsh-scope') {
        return {
          createScope: () => ({ ctx: standingCtx }),
          scopeOf: () => agentKey,
          bindScopeParent: (child: object, parent: object) => { binds.push([child, parent]) },
        }
      }
      return { name: id }
    }
    const logs: string[] = []
    const preset = createAssistantPreset({
      host: {} as never,
      load,
      log: (line) => { logs.push(line) },
    })
    await preset.join({})
    await preset.join({})
    expect(plugins).toHaveLength(ASSISTANT_PRESET_ROWS.length)
    expect(plugins[0]).toContain('@deepseek-ai/dsh-tool-web')
    expect(binds).toHaveLength(2)
    expect(logs.some((line) => line.includes('tool-web mounted'))).toBe(true)
  })
})
