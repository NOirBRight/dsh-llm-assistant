type CssClassMap = Readonly<Record<string, string>>

const MESSAGE_STYLE_ID = '@deepseek-ai/dsh-client-ui-conversation/AssistantMarkdown.module.css'
const REASONING_STYLE_ID = '@deepseek-ai/dsh-client-ui-conversation/ReasoningRow.module.css'
const TOOL_STYLE_ID = '@deepseek-ai/dsh-client-ui-tool/ToolRow.module.css'
const CHAT_VIEW_STYLE_ID = '@deepseek-ai/dsh-client-ui-conversation/ChatView.module.css'
const MESSAGE_ITEM_STYLE_ID = '@deepseek-ai/dsh-client-ui-conversation/MessageItem.module.css'

const MESSAGE_KEYS = ['root', 'body', 'stopped', 'actions'] as const
const REASONING_KEYS = ['root', 'row', 'leading', 'chevron', 'title', 'separator', 'summary', 'thinkBody'] as const
const TOOL_KEYS = ['root', 'row', 'leading', 'chevron', 'title', 'sep', 'summary', 'errorSummary', 'ioCard', 'ioSection', 'ioDivider', 'ioLabel', 'ioText', 'visuallyHidden'] as const
const CHAT_VIEW_KEYS = ['column', 'flowItem', 'turnStatus', 'turnStatusClock'] as const
const MESSAGE_ITEM_KEYS = ['userRow', 'userStack', 'bubble', 'turnErrorRow', 'turnErrorDot', 'turnErrorCopy', 'turnErrorTitle', 'turnErrorMessage', 'turnErrorCode'] as const

/**
 * Adapter seam over DSH-owned CSS modules. The stable data-plugin-css id and
 * semantic local class suffixes are resolved at runtime; build hashes and all
 * declarations remain owned by the official renderer packages.
 */
export const officialFlowStyles = {
  message: (): CssClassMap => readOfficialCssModule(MESSAGE_STYLE_ID, MESSAGE_KEYS),
  reasoning: (): CssClassMap => readOfficialCssModule(REASONING_STYLE_ID, REASONING_KEYS),
  tool: (): CssClassMap => readOfficialCssModule(TOOL_STYLE_ID, TOOL_KEYS),
  chatView: (): CssClassMap => readOfficialCssModule(CHAT_VIEW_STYLE_ID, CHAT_VIEW_KEYS),
  messageItem: (): CssClassMap => readOfficialCssModule(MESSAGE_ITEM_STYLE_ID, MESSAGE_ITEM_KEYS),
}

export function extractCssModuleClasses(css: string, keys: readonly string[]): Record<string, string> {
  const result: Record<string, string> = {}
  for (const key of keys) {
    if (!/^[a-zA-Z0-9_-]+$/.test(key)) continue
    const match = css.match(new RegExp('\\.([_a-zA-Z0-9-]+_' + key + ')(?=[\\s,.#:{>\\[])'))
    if (match?.[1] !== undefined) result[key] = match[1]
  }
  return result
}

export function classes(...values: readonly (string | undefined | false)[]): string {
  return values.filter((value): value is string => typeof value === 'string' && value !== '').join(' ')
}

const cache = new Map<string, { readonly css: string; readonly classes: CssClassMap }>()

function readOfficialCssModule(styleId: string, keys: readonly string[]): CssClassMap {
  if (typeof document === 'undefined') return {}
  const tag = document.querySelector(`style[data-plugin-css=${JSON.stringify(styleId)}]`)
  const css = tag?.textContent ?? ''
  const previous = cache.get(styleId)
  if (previous?.css === css) return previous.classes
  const resolved = extractCssModuleClasses(css, keys)
  cache.set(styleId, { css, classes: resolved })
  return resolved
}
