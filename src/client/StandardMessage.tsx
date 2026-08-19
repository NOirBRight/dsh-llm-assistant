import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { classes, officialFlowStyles } from './official-flow-styles.ts'
import {
  DisclosureRow,
  IconApiOutline14,
  IconBrowseOutline16,
  IconCodeOutline16,
  IconEditOutline16,
  IconSearchOutline16,
  IconSparkle16,
  IconThinkOutline14,
  MarkdownText,
  StateDot,
} from '@deepseek-ai/dsh-client-ui-primitives'

export function StandardAssistantMessage({ text, streaming = false }: { text: string; streaming?: boolean }): JSX.Element {
  const styles = officialFlowStyles.message()
  return (
    <div
      className={classes(styles.root, 'dsh-assistant-standard-message')}
      data-official-styles={styles.root !== undefined || undefined}
      data-streaming={streaming || undefined}
    >
      <StandardFlowBody><MarkdownText text={text} streaming={streaming} codeLabels={CODE_LABELS} /></StandardFlowBody>
    </div>
  )
}

export function StandardFlowBody({ children }: { children: ReactNode }): JSX.Element {
  const styles = officialFlowStyles.message()
  return (
    <div
      className={classes(styles.body, 'dsh-assistant-standard-message-body')}
      data-official-styles={styles.body !== undefined || undefined}
    >{children}</div>
  )
}

export function StandardReasoningRow({ text, running }: { text: string; running: boolean }): JSX.Element {
  const [expanded, setExpanded] = useState(false)
  const summaryRef = useRef<HTMLSpanElement | null>(null)
  const summary = running ? latestLine(text) : firstLine(text)
  const styles = officialFlowStyles.reasoning()

  const scheduleSummaryScroll = useThrottledVisualUpdate(() => {
    const element = summaryRef.current
    if (element !== null) element.scrollLeft = running ? element.scrollWidth - element.clientWidth : 0
  })

  useEffect(() => { scheduleSummaryScroll() }, [running, scheduleSummaryScroll, summary])

  return (
    <div
      className={classes(styles.root, 'dsh-assistant-standard-reasoning')}
      data-official-styles={styles.root !== undefined || undefined}
      data-variant="think"
      data-state={running ? 'running' : 'ok'}
    >
      {running && <span className="dsh-assistant-visually-hidden">Running</span>}
      <DisclosureRow
        rowClassName={classes(styles.row, 'dsh-assistant-standard-flow-row')}
        leadingClassName={classes(styles.leading, 'dsh-assistant-standard-flow-leading')}
        titleClassName={classes(styles.title, 'dsh-assistant-standard-flow-title')}
        chevronClassName={classes(styles.chevron, 'dsh-assistant-standard-flow-chevron')}
        icon={<IconThinkOutline14 size={14} />}
        title="Think"
        open={expanded}
        expandable
        expandOnRowClick
        onToggle={() => { setExpanded((value) => !value) }}
        collapsedContent={(
          <>
            <span className={classes(styles.separator, 'dsh-assistant-standard-flow-separator')} aria-hidden />
            <span ref={summaryRef} className={classes(styles.summary, 'dsh-assistant-standard-flow-summary')} data-follow-end={running || undefined}>{summary}</span>
          </>
        )}
      >
        <div className={classes(styles.thinkBody, 'dsh-assistant-standard-reasoning-body')}>{text}</div>
      </DisclosureRow>
    </div>
  )
}

export function StandardToolRow({ name, summary, status, input, output }: {
  name: string
  summary: string
  status: 'running' | 'done' | 'error' | 'stopped'
  input?: string
  output?: string
}): JSX.Element {
  const [expanded, setExpanded] = useState(false)
  const state = status === 'done' ? 'ok' : status
  const expandable = input !== undefined || output !== undefined
  const variant = toolVariant(name)
  const icon = toolIcon(name, state)
  const title = toolTitle(name, variant)
  const shownSummary = variant === 'others' && title === 'Tool call' && summary !== '' ? `${name} · ${summary}` : summary
  const styles = officialFlowStyles.tool()

  return (
    <div
      className={classes(styles.root, 'dsh-assistant-standard-tool')}
      data-official-styles={styles.root !== undefined || undefined}
      data-variant={variant}
      data-tool={name}
      data-state={state}
    >
      {state !== 'ok' && <span className="dsh-assistant-visually-hidden">{state === 'running' ? 'Running' : state === 'stopped' ? 'Stopped' : 'Failed'}</span>}
      <DisclosureRow
        rowClassName={classes(styles.row, 'dsh-assistant-standard-flow-row')}
        leadingClassName={classes(styles.leading, 'dsh-assistant-standard-flow-leading')}
        titleClassName={classes(styles.title, 'dsh-assistant-standard-flow-title')}
        chevronClassName={classes(styles.chevron, 'dsh-assistant-standard-flow-chevron')}
        icon={icon}
        title={title}
        open={expanded && expandable}
        expandable={expandable}
        expandOnRowClick
        keepContentWhenOpen
        onToggle={() => { if (expandable) setExpanded((value) => !value) }}
        collapsedContent={shownSummary !== '' ? (
          <>
            <span className={classes(styles.sep, 'dsh-assistant-standard-flow-separator')} aria-hidden />
            <span className={classes(styles.summary, state === 'error' && styles.errorSummary, 'dsh-assistant-standard-flow-summary')}>{shownSummary}</span>
          </>
        ) : undefined}
      >
        {expandable && (
          <div className={classes(styles.ioCard, 'dsh-assistant-standard-tool-io')}>
            {input !== undefined && <ToolIo label="IN">{input}</ToolIo>}
            {input !== undefined && output !== undefined && <span className={classes(styles.ioDivider, 'dsh-assistant-standard-tool-divider')} />}
            {output !== undefined && <ToolIo label="OUT" error={state === 'error'}>{output}</ToolIo>}
          </div>
        )}
      </DisclosureRow>
    </div>
  )
}

export function StandardUserMessage({ text, images }: { text: string; images?: ReactNode }): JSX.Element {
  const styles = officialFlowStyles.messageItem()
  return (
    <div
      className={classes(styles.userRow, 'dsh-assistant-user-row')}
      data-official-styles={styles.userRow !== undefined || undefined}
      data-time-hover-root
    >
      <div className={classes(styles.userStack, 'dsh-assistant-user-stack')}>
        {images}
        {text !== '' && <div className={classes(styles.bubble, 'dsh-assistant-user-bubble')}>{text}</div>}
      </div>
    </div>
  )
}

export function StandardErrorRow({ text, locale = 'zh' }: { text: string; locale?: string }): JSX.Element {
  const styles = officialFlowStyles.messageItem()
  return (
    <div
      className={classes(styles.turnErrorRow, 'dsh-assistant-error')}
      data-official-styles={styles.turnErrorRow !== undefined || undefined}
      role="status"
    >
      <StateDot state="error" className={styles.turnErrorDot} />
      <div className={styles.turnErrorCopy}>
        <span className={styles.turnErrorTitle}>{locale.toLocaleLowerCase().startsWith('zh') ? '本轮运行失败' : 'This turn failed'}</span>
        <span className={styles.turnErrorMessage}>{text}</span>
      </div>
    </div>
  )
}

export function StandardFlowColumn({ children }: { children: ReactNode }): JSX.Element {
  const styles = officialFlowStyles.chatView()
  return <div className={classes(styles.column, 'dsh-assistant-column')} data-official-styles={styles.column !== undefined || undefined}>{children}</div>
}

export function StandardFlowItem({ children }: { children: ReactNode }): JSX.Element {
  const styles = officialFlowStyles.chatView()
  return <div className={classes(styles.flowItem, 'dsh-assistant-flow-item')}>{children}</div>
}

export function StandardActivityIndicator({ startTime, locale = 'zh' }: { startTime?: number; locale?: string }): JSX.Element {
  const [mountedAt] = useState(() => Date.now())
  const anchor = startTime ?? mountedAt
  const [elapsedMs, setElapsedMs] = useState(() => Math.max(0, Date.now() - anchor))
  const styles = officialFlowStyles.chatView()

  useEffect(() => {
    const tick = (): void => { setElapsedMs(Math.max(0, Date.now() - anchor)) }
    tick()
    const id = setInterval(tick, 1_000)
    return () => { clearInterval(id) }
  }, [anchor])

  return (
    <div
      className={classes(styles.turnStatus, 'dsh-assistant-standard-activity')}
      data-official-styles={styles.turnStatus !== undefined || undefined}
      role="status"
      aria-live="polite"
    >
      Deep diving...
      {elapsedMs >= 15_000 && (
        <span className={classes(styles.turnStatusClock, 'dsh-assistant-standard-activity-clock')} aria-hidden>
          {formatRunDuration(elapsedMs, locale)}
        </span>
      )}
    </div>
  )
}

function ToolIo({ label, error = false, children }: { label: string; error?: boolean; children: ReactNode }): JSX.Element {
  const styles = officialFlowStyles.tool()
  return (
    <div className={classes(styles.ioSection, 'dsh-assistant-standard-tool-io-section')}>
      <span className={classes(styles.ioLabel, 'dsh-assistant-standard-tool-io-label')}>{label}</span>
      <span className={classes(styles.ioText, 'dsh-assistant-standard-tool-io-text')} data-error={error || undefined}>{children}</span>
    </div>
  )
}

function toolIcon(name: string, state: 'running' | 'ok' | 'error' | 'stopped'): ReactNode {
  if (state === 'error') return <StateDot state="error" />
  if (state === 'stopped') return <StateDot state="warning" />
  const variant = toolVariant(name)
  if (variant === 'search') return <IconSearchOutline16 size={14} />
  if (variant === 'read') return <IconBrowseOutline16 size={14} />
  if (variant === 'bash') return <IconApiOutline14 size={14} />
  if (variant === 'write' || variant === 'edit') return <IconEditOutline16 size={14} />
  if (variant === 'code') return <IconCodeOutline16 size={14} />
  return <IconSparkle16 size={14} />
}

type ToolVariant = 'search' | 'read' | 'bash' | 'write' | 'edit' | 'code' | 'others'

function toolVariant(name: string): ToolVariant {
  return TOOL_VARIANTS[name] ?? 'others'
}

function toolTitle(name: string, variant: ToolVariant): string {
  return TOOL_TITLES[name] ?? VARIANT_TITLES[variant]
}

const TOOL_VARIANTS: Readonly<Record<string, ToolVariant>> = {
  bash: 'bash', pwsh: 'bash', read: 'read', web_fetch: 'read', web_search: 'search', grep: 'search', glob: 'search',
  write: 'write', edit: 'edit', run_code: 'code', cordis_package_inspect: 'read', cordis_runtime_inspect: 'read',
  cordis_run: 'others', cordis_stop: 'others', cordis_undefine: 'others',
}

const VARIANT_TITLES: Readonly<Record<ToolVariant, string>> = {
  search: 'Search', read: 'Read', bash: 'Bash', write: 'Write', edit: 'Edit', code: 'Code', others: 'Tool call',
}

const TOOL_TITLES: Readonly<Record<string, string>> = {
  cordis_package_inspect: 'Inspect', cordis_runtime_inspect: 'Inspect', cordis_run: 'Run Cordis Plugin',
  cordis_stop: 'Stop Cordis Plugin', cordis_undefine: 'Remove Cordis Plugin', pwsh: 'Pwsh',
}

function formatRunDuration(ms: number, locale: string): string {
  const total = Math.max(0, Math.floor(ms / 1_000))
  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  if (locale.toLocaleLowerCase().startsWith('zh')) {
    return minutes > 0 ? String(minutes) + '分' + String(seconds).padStart(2, '0') + '秒' : String(seconds) + '秒'
  }
  return minutes > 0 ? String(minutes) + 'm ' + String(seconds).padStart(2, '0') + 's' : String(seconds) + 's'
}

function firstLine(text: string): string {
  const newline = text.indexOf('\n')
  return newline === -1 ? text : text.slice(0, newline)
}

function latestLine(text: string): string {
  const visible = text.trimEnd()
  const newline = visible.lastIndexOf('\n')
  return newline === -1 ? visible : visible.slice(newline + 1)
}

function useThrottledVisualUpdate(update: () => void, intervalFrames = 3): () => void {
  const updateRef = useRef(update)
  updateRef.current = update
  const pendingFrameRef = useRef<number | null>(null)

  useBrowserLayoutEffect(() => () => {
    if (pendingFrameRef.current === null) return
    cancelAnimationFrame(pendingFrameRef.current)
    pendingFrameRef.current = null
  }, [])

  return useCallback(() => {
    if (pendingFrameRef.current !== null) return
    let remainingFrames = intervalFrames
    const advance = (): void => {
      remainingFrames -= 1
      if (remainingFrames > 0) {
        pendingFrameRef.current = requestAnimationFrame(advance)
        return
      }
      pendingFrameRef.current = null
      updateRef.current()
    }
    pendingFrameRef.current = requestAnimationFrame(advance)
  }, [intervalFrames])
}

const useBrowserLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect
const CODE_LABELS = { copyLabel: 'Copy', copiedLabel: 'Copied' } as const
