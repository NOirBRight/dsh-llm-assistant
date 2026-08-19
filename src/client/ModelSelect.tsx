/** Two-level Model / Effort menu, pixel-matched to ui-model-selection ModelSelect. */

import { useEffect, useRef, useState } from 'react'
import { cls } from './css.ts'
import type { ModelChrome, ModelEffort, ModelOption } from '../contract.ts'

type Pane = 'root' | 'model' | 'effort'

export function AssistantModelSelect({
  model,
  onSelect,
}: {
  model: ModelChrome | undefined
  onSelect: (modelId: string, effort?: string, provider?: string) => void
}): JSX.Element {
  const [open, setOpen] = useState(false)
  const [pane, setPane] = useState<Pane>('root')
  const rootRef = useRef<HTMLDivElement | null>(null)
  const groups = model?.groups ?? []
  const flat: readonly ModelOption[] = model?.options ?? groups.flatMap((group) => group.models)
  const current = flat.find((entry) => entry.id === model?.model && (model.provider === undefined || entry.provider === model.provider))
    ?? flat.find((entry) => entry.id === model?.model)
  const modelLabel = current?.label ?? model?.model ?? 'Model'
  const efforts: readonly ModelEffort[] = current?.efforts ?? model?.efforts ?? []
  const effortLabel = model?.effortLabel ?? efforts.find((item) => item.id === model?.effort)?.name ?? model?.effort

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent): void => {
      if (event.target instanceof Node && rootRef.current?.contains(event.target) === true) return
      setOpen(false)
      setPane('root')
    }
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      if (pane !== 'root') setPane('root')
      else { setOpen(false); setPane('root') }
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open, pane])

  return (
    <div ref={rootRef} className={cls.msRoot}>
      <button
        type="button"
        className={cls.msTrigger}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => {
          if (open) { setOpen(false); setPane('root') }
          else { setOpen(true); setPane('root') }
        }}
      >
        <span className={cls.msTriggerLabel}>{modelLabel}</span>
        {effortLabel !== undefined && <span className={cls.msTriggerEffort}>{effortLabel}</span>}
        <svg className={open ? cls.msChevron + ' ' + cls.msChevronOpen : cls.msChevron} width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
          <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <div className={cls.msMenu} role="menu">
          {pane === 'root' && (
            <>
              <button type="button" role="menuitem" className={cls.msCell} onClick={() => { setPane('model') }}>
                <span className={cls.msCellLabel}>Model</span>
                <span className={cls.msCellValue}>{modelLabel}</span>
                <span className={cls.msCellChevron}>›</span>
              </button>
              {efforts.length > 0 && (
                <button type="button" role="menuitem" className={cls.msCell} onClick={() => { setPane('effort') }}>
                  <span className={cls.msCellLabel}>Effort</span>
                  <span className={cls.msCellValue}>{effortLabel ?? 'Default'}</span>
                  <span className={cls.msCellChevron}>›</span>
                </button>
              )}
            </>
          )}
          {pane === 'model' && (
            <div className={cls.msGroups}>
              {groups.length === 0 && flat.length === 0 && <div className={cls.msStatus}>No models</div>}
              {groups.length > 0 ? groups.map((group) => (
                <section key={group.id}>
                  <div className={cls.msGroupTitle}>{group.name}</div>
                  {group.models.map((option) => (
                    <ModelRow
                      key={group.id + ':' + option.id}
                      option={option}
                      selected={option.id === model?.model && option.provider === model.provider}
                      onPick={() => { onSelect(option.id, undefined, option.provider); setOpen(false); setPane('root') }}
                    />
                  ))}
                </section>
              )) : flat.map((option) => (
                <ModelRow
                  key={option.provider + ':' + option.id}
                  option={option}
                  selected={option.id === model?.model}
                  onPick={() => { onSelect(option.id, undefined, option.provider); setOpen(false); setPane('root') }}
                />
              ))}
            </div>
          )}
          {pane === 'effort' && (
            <div className={cls.msGroups}>
              {efforts.map((effort) => (
                <button
                  type="button"
                  key={effort.id}
                  role="menuitemradio"
                  aria-checked={effort.id === model?.effort}
                  className={effort.id === model?.effort ? cls.msOption + ' ' + cls.msSelected : cls.msOption}
                  onClick={() => {
                    if (model !== undefined) onSelect(model.model, effort.id, model.provider)
                    setOpen(false)
                    setPane('root')
                  }}
                >
                  <span className={cls.msOptionCopy}>{effort.name}</span>
                  {effort.id === model?.effort && <span className={cls.msCheck}>✓</span>}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function ModelRow({ option, selected, onPick }: { option: ModelOption; selected: boolean; onPick: () => void }): JSX.Element {
  return (
    <button
      type="button"
      role="menuitemradio"
      aria-checked={selected}
      className={selected ? cls.msOption + ' ' + cls.msSelected : cls.msOption}
      onClick={onPick}
    >
      <span className={cls.msOptionCopy}>{option.label}</span>
      {selected && <span className={cls.msCheck}>✓</span>}
    </button>
  )
}
