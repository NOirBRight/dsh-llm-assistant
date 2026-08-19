import { describe, expect, it } from 'vitest'
import { extractCssModuleClasses } from '../src/client/official-flow-styles.ts'

describe('official flow stylesheet adapter', () => {
  it('resolves semantic module classes without depending on hashes', () => {
    const css = '.abc123_root{display:flex}.abc123_body{gap:16px}.abc123_stopped{font-size:11px}'

    expect(extractCssModuleClasses(css, ['root', 'body', 'stopped'])).toEqual({
      root: 'abc123_root', body: 'abc123_body', stopped: 'abc123_stopped',
    })
  })

  it('leaves renamed or unavailable classes absent for local fallback', () => {
    expect(extractCssModuleClasses('.next_root{display:flex}', ['root', 'body'])).toEqual({ root: 'next_root' })
  })
})
