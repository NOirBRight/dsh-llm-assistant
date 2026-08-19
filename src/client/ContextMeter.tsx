/** Composer context meter: pixel-matched to ui-conversation ContextMeter. */

import { useEffect, useRef, useState } from 'react'
import { Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
import { cls } from './css.ts'
import type { ContextChrome } from '../contract.ts'

const RADIUS = 5.5
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

const ROWS = [
  { key: 'system', label: 'System prompt', tint: cls.cmSystem },
  { key: 'tools', label: 'Tools', tint: cls.cmTools },
  { key: 'messages', label: 'Messages', tint: cls.cmMessages },
] as const

export function AssistantContextMeter({ context, usedLabel = 'of context used' }: { context: ContextChrome; usedLabel?: string }): JSX.Element {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLSpanElement | null>(null)
  const percent = Math.min(100, Math.round((context.used / Math.max(context.cap, 1)) * 100))
  const reading = String(percent) + '%'
  const aria = reading + ' ' + usedLabel
  const total = context.system + context.tools + context.messages
  const parts = total === 0
    ? [{ key: 'total', tint: undefined, width: percent }]
    : ROWS.map((row) => ({ key: row.key, tint: row.tint, width: percent * context[row.key] / total })).filter((part) => part.width > 0)

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent): void => {
      if (event.target instanceof Node && rootRef.current?.contains(event.target) === true) return
      setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return (
    <span ref={rootRef} className={cls.cmRoot}>
      <Tooltip label={aria} side="top" delayMs={200} disabled={open}>
        <button
          type="button"
          className={cls.cmTrigger}
          aria-label={aria}
          aria-haspopup="dialog"
          aria-expanded={open}
          onClick={() => { setOpen((value) => !value) }}
        >
          <svg viewBox="0 0 14 14" width="14" height="14" aria-hidden="true">
            <circle className={cls.cmTrack} cx="7" cy="7" r={RADIUS} />
            <circle
              className={cls.cmFill}
              cx="7"
              cy="7"
              r={RADIUS}
              strokeDasharray={String(CIRCUMFERENCE * percent / 100) + ' ' + String(CIRCUMFERENCE)}
              transform="rotate(-90 7 7)"
            />
          </svg>
        </button>
      </Tooltip>
      {open && (
        <div className={cls.cmPanel} role="dialog" aria-label={usedLabel}>
          <div className={cls.cmHeader}>
            <span className={cls.cmPercent}>{reading}</span>
            <span className={cls.cmHeadline}>{usedLabel}</span>
            <span className={cls.cmFigures}>{'~' + formatTokens(context.used) + ' / ' + formatTokens(context.cap)}</span>
          </div>
          <div className={cls.cmBar}>
            {parts.map((part) => (
              <div
                key={part.key}
                className={part.tint === undefined ? cls.cmSegment : cls.cmSegment + ' ' + part.tint}
                style={{ width: String(part.width) + '%' }}
              />
            ))}
          </div>
          <dl className={cls.cmRows}>
            {ROWS.map((row) => (
              <div key={row.key} className={cls.cmRow}>
                <dt>
                  <span className={cls.cmSwatch + ' ' + row.tint} aria-hidden="true" />
                  {row.label}
                </dt>
                <dd>{'~' + formatTokens(context[row.key])}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </span>
  )
}

function formatTokens(n: number): string {
  const scaled = (v: number): string => v >= 100 ? String(Math.round(v)) : String(Math.round(v * 10) / 10)
  if (n < 1000) return String(n)
  if (n < 1000000) return scaled(n / 1000) + 'K'
  return scaled(n / 1000000) + 'M'
}
