import { useCallback, useEffect, useRef, useState } from 'react'
import {
  IconBranchOutline16,
  IconCheckOutline16,
  IconCopyOutline16,
  IconDislikeFill16,
  IconDislikeOutline16,
  IconLikeFill16,
  IconLikeOutline16,
  Tooltip,
  writeClipboard,
} from '@deepseek-ai/dsh-client-ui-primitives'
import { cls } from './css.ts'

export type MessageFeedback = 'like' | 'dislike'

export function MessageActions({
  text,
  align,
  showFeedback = false,
  feedback,
  onFeedback,
  onBranch,
  branchDisabled = false,
  zh = true,
}: {
  text: string
  align: 'start' | 'end'
  showFeedback?: boolean
  feedback?: MessageFeedback
  onFeedback?: (next: MessageFeedback) => void
  onBranch?: () => void
  branchDisabled?: boolean
  zh?: boolean
}): JSX.Element | null {
  const [copied, setCopied] = useState(false)
  const pending = useRef(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => {
    pending.current = false
    if (timer.current !== null) clearTimeout(timer.current)
  }, [])

  const onCopy = useCallback(() => {
    if (copied || pending.current || text.trim() === '') return
    pending.current = true
    void writeClipboard(text).then((ok) => {
      pending.current = false
      if (!ok) return
      setCopied(true)
      timer.current = setTimeout(() => {
        timer.current = null
        setCopied(false)
      }, 1000)
    })
  }, [copied, text])

  if (text.trim() === '' && !showFeedback && onBranch === undefined) return null

  const copyLabel = copied ? (zh ? '已复制' : 'Copied') : (zh ? '复制' : 'Copy')
  const likeLabel = feedback === 'like' ? (zh ? '取消点赞' : 'Remove like') : (zh ? '点赞' : 'Like')
  const dislikeLabel = feedback === 'dislike' ? (zh ? '取消点踩' : 'Remove dislike') : (zh ? '点踩' : 'Dislike')
  const branchLabel = branchDisabled
    ? (zh ? '回复完成后再分支' : 'Wait until the reply finishes')
    : (zh ? '在新对话中分支' : 'Branch in a new conversation')

  return (
    <div className={cls.actions} data-align={align} data-time-hover-root>
      {text.trim() !== '' && (
        <Tooltip label={copyLabel} side="bottom">
          <button type="button" className={cls.action} aria-label={copyLabel} onClick={onCopy}>
            {copied ? <IconCheckOutline16 /> : <IconCopyOutline16 />}
          </button>
        </Tooltip>
      )}
      {showFeedback && onFeedback !== undefined && (
        <>
          <Tooltip label={likeLabel} side="bottom">
            <button
              type="button"
              className={cls.action}
              aria-label={likeLabel}
              aria-pressed={feedback === 'like'}
              data-active={feedback === 'like' || undefined}
              onClick={() => { onFeedback('like') }}
            >
              {feedback === 'like' ? <IconLikeFill16 /> : <IconLikeOutline16 />}
            </button>
          </Tooltip>
          <Tooltip label={dislikeLabel} side="bottom">
            <button
              type="button"
              className={cls.action}
              aria-label={dislikeLabel}
              aria-pressed={feedback === 'dislike'}
              data-active={feedback === 'dislike' || undefined}
              onClick={() => { onFeedback('dislike') }}
            >
              {feedback === 'dislike' ? <IconDislikeFill16 /> : <IconDislikeOutline16 />}
            </button>
          </Tooltip>
        </>
      )}
      {onBranch !== undefined && (
        <Tooltip label={branchLabel} side="bottom">
          <button
            type="button"
            className={cls.action}
            aria-label={zh ? '在新对话中分支' : 'Branch in a new conversation'}
            aria-disabled={branchDisabled || undefined}
            data-unavailable={branchDisabled || undefined}
            onClick={branchDisabled ? undefined : onBranch}
          >
            <IconBranchOutline16 />
          </button>
        </Tooltip>
      )}
    </div>
  )
}

const FEEDBACK_KEY = 'dsh-llm-assistant.feedback'

export function readMessageFeedback(sessionId: string, seq: number): MessageFeedback | undefined {
  try {
    const raw = window.localStorage.getItem(FEEDBACK_KEY + '.' + sessionId + '.' + String(seq))
    return raw === 'like' || raw === 'dislike' ? raw : undefined
  } catch {
    return undefined
  }
}

export function writeMessageFeedback(sessionId: string, seq: number, next: MessageFeedback | undefined): void {
  try {
    const key = FEEDBACK_KEY + '.' + sessionId + '.' + String(seq)
    if (next === undefined) window.localStorage.removeItem(key)
    else window.localStorage.setItem(key, next)
  } catch {
    // Private mode / quota.
  }
}
