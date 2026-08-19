import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { MessageActions } from '../src/client/MessageActions.tsx'
import { StandardUserMessage } from '../src/client/StandardMessage.tsx'

describe('assistant message chrome', () => {
  it('puts a copy control under user bubbles', () => {
    const html = renderToStaticMarkup(
      <StandardUserMessage text="hello" actions={<MessageActions text="hello" align="end" zh />} />,
    )
    expect(html).toContain('aria-label="复制"')
    expect(html).toContain('dsh-assistant-actions')
    expect(html).toContain('data-align="end"')
  })

  it('puts copy, feedback, and branch under assistant answers', () => {
    const html = renderToStaticMarkup(
      <MessageActions text="answer" align="start" showFeedback onFeedback={() => undefined} onBranch={() => undefined} zh />,
    )
    expect(html).toContain('aria-label="复制"')
    expect(html).toContain('aria-label="点赞"')
    expect(html).toContain('aria-label="点踩"')
    expect(html).toContain('aria-label="在新对话中分支"')
  })

  it('disables branch while a turn is still running', () => {
    const html = renderToStaticMarkup(
      <MessageActions text="answer" align="start" onBranch={() => undefined} branchDisabled zh />,
    )
    expect(html).toContain('data-unavailable="true"')
    expect(html).toContain('aria-disabled="true"')
  })
})
