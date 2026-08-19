import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { StandardActivityIndicator, StandardAssistantMessage, StandardErrorRow, StandardReasoningRow, StandardToolRow, StandardUserMessage } from '../src/client/StandardMessage.tsx'

describe('standard main-chat rendering parity', () => {
  afterEach(() => { vi.useRealTimers() })

  it('uses the main window Deep diving turn status with its elapsed clock', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2_792_000))
    const html = renderToStaticMarkup(<StandardActivityIndicator startTime={0} locale="zh" />)

    expect(html).toContain('Deep diving...')
    expect(html).toContain('46分32秒')
    expect(html).not.toContain('>Thinking<')
    expect(html).not.toContain('data-state="ongoing"')
  })


  it('uses the main window user bubble and turn-error structures', () => {
    const user = renderToStaticMarkup(<StandardUserMessage text="hello" />)
    const error = renderToStaticMarkup(<StandardErrorRow text="boom" locale="en" />)

    expect(user).toContain('dsh-assistant-user-stack')
    expect(user).toContain('dsh-assistant-user-bubble')
    expect(error).toContain('This turn failed')
    expect(error).toContain('data-state="error"')
  })

  it('uses the official incremental Markdown renderer for rich content', () => {
    const html = renderToStaticMarkup(
      <StandardAssistantMessage
        text={'| Name | Value |\n| --- | --- |\n| **alpha** | `beta` |'}
        streaming
      /> ,
    )

    expect(html).toContain('<table>')
    expect(html).toContain('<strong>alpha</strong>')
    expect(html).toContain('<code>beta</code>')
    expect(html).not.toContain('dsh-assistant-caret')
    expect(html).toContain('data-streaming="true"')
  })

  it('matches the main reasoning disclosure semantics', () => {
    const html = renderToStaticMarkup(<StandardReasoningRow text={'first line\nlatest line'} running />)

    expect(html).toContain('data-variant="think"')
    expect(html).toContain('data-state="running"')
    expect(html).toContain('Think')
    expect(html).toContain('latest line')
    expect(html).toContain('aria-expanded="false"')
  })

  it('matches the main tool row state and disclosure semantics', () => {
    const html = renderToStaticMarkup(<StandardToolRow name="bash" summary="pnpm test" status="running" input="pnpm test" />)

    expect(html).toContain('data-tool="bash"')
    expect(html).toContain('data-state="running"')
    expect(html).toContain('>Bash</span>')
    expect(html).toContain('pnpm test')
    expect(html).toContain('aria-expanded="false"')
  })
})
