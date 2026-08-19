/** 席位：缩小版主聊天窗口。权限固定，不含 PermissionSelect。 */

import { useEffect, useRef, useState, useSyncExternalStore, type ClipboardEvent, type PointerEvent } from 'react'
import type { InjectFace, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { cls } from './css.ts'
import type { AssistantController } from './controller.ts'
import { WhaleMark } from './WhaleMark.tsx'
import { MiniMarkdown } from './MiniMarkdown.tsx'
import { AssistantContextMeter } from './ContextMeter.tsx'
import { AssistantModelSelect } from './ModelSelect.tsx'
import type { ChatImageRef, TimelineItem } from '../contract.ts'

export interface AssistantSeatFace {
  controller: AssistantController
}

export type AssistantSeatProps = InjectFace<AssistantSeatFace> & PropsRuntime<'shell.overlay'>

interface TaskBinding {
  readonly sessionId: string
  readonly label: string
  readonly refresh: boolean
  readonly assistantSessionId?: string
}

interface DraftImage {
  readonly id: string
  readonly name: string
  readonly mediaType: string
  readonly dataBase64: string
  readonly previewUrl: string
}

export function AssistantSeat({ controller, useSessions }: AssistantSeatProps): JSX.Element {
  const [open, setOpen] = useState(false)
  const [lastSeenSeq, setLastSeenSeq] = useState<number | null>(null)
  const [draft, setDraft] = useState('')
  const [images, setImages] = useState<DraftImage[]>([])
  const [task, setTask] = useState<TaskBinding | undefined>(() => readTaskBinding())
  const [taskPickerOpen, setTaskPickerOpen] = useState(false)
  const [taskSearch, setTaskSearch] = useState('')
  const [size, setSize] = useState({ width: 368, height: 483 })
  const [preview, setPreview] = useState<DraftImage | null>(null)
  const [sendError, setSendError] = useState<string | null>(null)
  const [rolloverBusy, setRolloverBusy] = useState(false)
  const [anchorBottom, setAnchorBottom] = useState(PET_DEFAULT_BOTTOM)
  const bodyRef = useRef<HTMLDivElement | null>(null)
  const fileRef = useRef<HTMLInputElement | null>(null)
  const inputRef = useRef<HTMLTextAreaElement | null>(null)
  const dragRef = useRef<{ startX: number; startY: number; width: number; height: number } | null>(null)
  const snapshot = useSyncExternalStore(controller.subscribe, controller.getSnapshot)
  const sessionList = useSessions()
  const taskCandidates = sessionList.ids
    .map((id) => sessionList.byId[id])
    .filter((entry): entry is NonNullable<typeof entry> => entry !== undefined && entry.origin !== 'subagent' && !entry.blank)
    .filter((entry) => taskSearch.trim() === '' || (entry.displayTitle + ' ' + (entry.cwd ?? '')).toLocaleLowerCase().includes(taskSearch.trim().toLocaleLowerCase()))
    .sort((left, right) => left.id === sessionList.current ? -1 : right.id === sessionList.current ? 1 : right.updatedAt - left.updatedAt)

  useEffect(() => {
    let cardObserver: ResizeObserver | undefined
    let phaseObserver: MutationObserver | undefined
    let observedCard: HTMLElement | undefined
    let observedRoot: Element | undefined
    const measure = (): void => {
      const card = document.querySelector('[data-composer-card]')
      if (!(card instanceof HTMLElement)) {
        setAnchorBottom(PET_DEFAULT_BOTTOM)
        return
      }
      setAnchorBottom(measurePetBottom(card))
    }
    const bind = (): void => {
      const card = document.querySelector('[data-composer-card]')
      if (!(card instanceof HTMLElement)) {
        if (observedCard !== undefined) {
          cardObserver?.disconnect()
          phaseObserver?.disconnect()
          observedCard = undefined
          observedRoot = undefined
          setAnchorBottom(PET_DEFAULT_BOTTOM)
        }
        return
      }
      if (observedCard !== card) {
        cardObserver?.disconnect()
        cardObserver = new ResizeObserver(measure)
        cardObserver.observe(card)
        observedCard = card
      }
      const root = card.closest('[data-phase]')
      if (root !== observedRoot) {
        phaseObserver?.disconnect()
        phaseObserver = undefined
        observedRoot = root ?? undefined
        if (root !== null) {
          phaseObserver = new MutationObserver(measure)
          phaseObserver.observe(root, { attributes: true, attributeFilter: ['data-phase'] })
        }
      }
      measure()
    }
    bind()
    const retry = setInterval(bind, 400)
    window.addEventListener('resize', measure)
    return () => {
      cardObserver?.disconnect()
      phaseObserver?.disconnect()
      clearInterval(retry)
      window.removeEventListener('resize', measure)
    }
  }, [])

  useEffect(() => {
    writeTaskBinding(task)
  }, [task])

  useEffect(() => {
    const assistantSessionId = snapshot?.sessionId
    if (assistantSessionId === undefined) return
    setTask((current) => current === undefined || current.assistantSessionId === assistantSessionId
      ? current
      : { ...current, refresh: true })
  }, [snapshot?.sessionId])

  useEffect(() => {
    controller.watch()
    return () => { controller.unwatch() }
  }, [controller])

  useEffect(() => {
    if (!open) {
      controller.close()
      return
    }
    void controller.open()
  }, [open, controller])

  useEffect(() => {
    const id = snapshot?.sessionId
    const seq = snapshot?.seq
    if (id === undefined || seq === undefined) return
    if (open) {
      setLastSeenSeq(seq)
      writeLastSeenSeq(id, seq)
      return
    }
    setLastSeenSeq(readLastSeenSeq(id))
  }, [snapshot?.sessionId, snapshot?.seq, open])

  const items = snapshot?.items ?? messagesAsItems(snapshot?.messages ?? [])
  const pending = snapshot?.pending
  const thinking = snapshot?.thinking
  const busy = snapshot?.status === 'running'
  const todos = snapshot?.todos ?? []
  const goal = snapshot?.goal
  const model = snapshot?.model
  const context = snapshot?.context ?? { used: 1, cap: 128000, system: 0, tools: 0, messages: 1 }
  const contextSaturated = context.cap > 0 && context.used / context.cap >= 0.85


  useEffect(() => {
    const body = bodyRef.current
    if (body !== null) body.scrollTop = body.scrollHeight
  }, [open, items.length, pending, thinking, busy])

  useEffect(() => {
    const el = inputRef.current
    if (el === null) return
    el.style.height = '0px'
    const next = Math.min(Math.max(el.scrollHeight, 21), 126)
    el.style.height = `${next}px`
    el.style.overflowY = el.scrollHeight > 126 ? 'auto' : 'hidden'
  }, [draft, open])

  const send = (): void => {
    const text = draft.trim()
    if (text.length === 0 && images.length === 0) return
    const payload = images.map((image) => ({ name: image.name, mediaType: image.mediaType, dataBase64: image.dataBase64 }))
    setSendError(null)
    void controller.send(text.length === 0 && payload.length > 0 ? ' ' : text, payload, task === undefined ? undefined : { anchor: { sessionId: task.sessionId, label: task.label }, refresh: task.refresh }).then((ok) => {
      if (!ok) {
        setSendError('发送失败，请重试')
        return
      }
      setDraft('')
      if (task !== undefined) setTask({ ...task, refresh: false, ...(snapshot?.sessionId === undefined ? {} : { assistantSessionId: snapshot.sessionId }) })
      for (const image of images) URL.revokeObjectURL(image.previewUrl)
      setImages([])
    })
  }

  const addDraftImages = (files: readonly File[]): void => {
    const imagesOnly = files.filter(isImageFile)
    if (imagesOnly.length === 0) return
    void Promise.all(imagesOnly.map(readDraftImage)).then((next) => {
      setImages((current) => [...current, ...next])
    })
  }

  const onFiles = (list: FileList | null): void => {
    if (list === null) return
    addDraftImages(Array.from(list))
  }

  const onPaste = (event: ClipboardEvent<HTMLTextAreaElement>): void => {
    const fromItems = Array.from(event.clipboardData.items)
      .filter((item) => item.kind === 'file')
      .map((item) => item.getAsFile())
      .filter((file): file is File => file !== null)
    const files = fromItems.length > 0 ? fromItems : Array.from(event.clipboardData.files)
    if (!files.some(isImageFile)) return
    event.preventDefault()
    addDraftImages(files)
  }

  const empty = items.length === 0 && (pending === undefined || pending.length === 0)
  const canSend = draft.trim().length > 0 || images.length > 0

  const onResizeStart = (event: PointerEvent<HTMLDivElement>): void => {
    event.preventDefault()
    event.stopPropagation()
    dragRef.current = { startX: event.clientX, startY: event.clientY, width: size.width, height: size.height }
    event.currentTarget.setPointerCapture(event.pointerId)
  }
  const onResizeMove = (event: PointerEvent<HTMLDivElement>): void => {
    const drag = dragRef.current
    if (drag === null) return
    const nextWidth = Math.min(Math.max(drag.width + (drag.startX - event.clientX), 300), window.innerWidth - 24)
    const nextHeight = Math.min(Math.max(drag.height + (drag.startY - event.clientY), 322), window.innerHeight - 16)
    setSize({ width: nextWidth, height: nextHeight })
  }
  const onResizeEnd = (): void => { dragRef.current = null }

  useEffect(() => {
    if (preview === null) return
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setPreview(null)
    }
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('keydown', onKey) }
  }, [preview])

  return (
    <div className={cls.root}>
      {open && (
        <div className={cls.panel} role="dialog" aria-label="DeepSeek 小管家" style={{ width: size.width, height: size.height, bottom: anchorBottom }}>
          <div
            className={cls.resize}
            onPointerDown={onResizeStart}
            onPointerMove={onResizeMove}
            onPointerUp={onResizeEnd}
            onPointerCancel={onResizeEnd}
          />
          <div className={cls.panelHead}>
            <span className={cls.panelTitle}>DeepSeek 小管家</span>
            {busy && (
              <span className={cls.status}>
                {snapshot?.currentTool !== undefined ? `调用 ${snapshot.currentTool}…` : '思考中…'}
              </span>
            )}
            <button
              type="button"
              className={cls.newConversation}
              data-warning={contextSaturated ? 'true' : undefined}
              disabled={busy || rolloverBusy}
              title={busy ? '小管家回复完再新开' : contextSaturated ? '上下文将满，新开一条继续' : '用短交接开启一条新的助理对话'}
              aria-label={contextSaturated ? '上下文将满，新开一条继续' : '新对话'}
              onClick={() => {
                setRolloverBusy(true)
                setSendError(null)
                void controller.newConversation().then((error) => {
                  if (error !== undefined) setSendError(error)
                }).finally(() => { setRolloverBusy(false) })
              }}
            >{rolloverBusy ? '切换中' : '新对话'}</button>
            <button type="button" className={cls.close} aria-label="收起" onClick={() => { setOpen(false) }}>×</button>
          </div>
          <div className={cls.panelBody} ref={bodyRef}>
            {empty ? (
              <div className={cls.empty}>小管家还没说过话。发一条消息开始吧。</div>
            ) : (
              <div className={cls.column}>
                {items.map((item) => <TimelineRow key={item.kind + String(item.seq)} item={item} controller={controller} onOpenImage={(url, alt) => { setPreview({ id: url, name: alt, mediaType: 'image/png', dataBase64: '', previewUrl: url }) }} />)}
                {thinking !== undefined && thinking.length > 0 && (
                  <div className={cls.thinking}><span className={cls.thinkingLabel}>思考</span>{thinking}</div>
                )}
                {pending !== undefined && pending.length > 0 && (
                  <div className={cls.assistant}><MiniMarkdown text={pending} streaming /></div>
                )}
              </div>
            )}
          </div>
          {(todos.length > 0 || goal !== undefined) && (
            <div className={cls.dock}>
              {goal !== undefined && <div className={cls.dockTitle}>Goal · {goal.status}</div>}
              {goal !== undefined && <div className={cls.dockItem}>{goal.title}</div>}
              {todos.length > 0 && <div className={cls.dockTitle}>任务</div>}
              {todos.map((todo) => (
                <div key={todo.id} className={cls.dockItem} data-status={todo.status}>{todo.content}</div>
              ))}
            </div>
          )}
          {sendError !== null && <div className={cls.empty} style={{ padding: '4px 12px 0', margin: 0 }}>{sendError}</div>}
          <form className={cls.composer} onSubmit={(event) => { event.preventDefault(); send() }}>
            <div className={cls.card}>
              {task !== undefined && (
                <div className={cls.taskChip}>
                  <span title={task.label}>任务 · {task.label}{task.refresh ? ' · 待刷新' : ''}</span>
                  <button type="button" className={cls.taskChipButton} aria-label="刷新任务引用" title="下次发送重新捕获任务上下文" onClick={() => { setTask({ ...task, refresh: true }) }}>↻</button>
                  <button type="button" className={cls.taskChipButton} aria-label="更换任务" onClick={() => { setTaskPickerOpen(true) }}>更换</button>
                  <button type="button" className={cls.taskChipButton} aria-label="移除任务引用" onClick={() => { setTask(undefined); setTaskPickerOpen(false) }}>×</button>
                </div>
              )}
              {taskPickerOpen && (
                <div className={cls.taskPicker}>
                  <input className={cls.taskSearch} value={taskSearch} placeholder="搜索任务" aria-label="搜索任务" onChange={(event) => { setTaskSearch(event.currentTarget.value) }} />
                  <div className={cls.taskList}>
                    {taskCandidates.map((entry) => (
                      <button key={entry.id} type="button" className={cls.taskOption} onClick={() => {
                        setTask({ sessionId: entry.id, label: entry.displayTitle, refresh: true })
                        setTaskPickerOpen(false)
                        setTaskSearch('')
                      }}>
                        {entry.displayTitle}{entry.id === sessionList.current ? ' · 当前' : ''}
                        {entry.cwd !== undefined && <span className={cls.taskMeta}>{entry.cwd}</span>}
                      </button>
                    ))}
                    {taskCandidates.length === 0 && <div className={cls.taskMeta}>没有可引用的任务</div>}
                  </div>
                </div>
              )}
              {images.length > 0 && (
                <div className={cls.rail}>
                  {images.map((image) => (
                    <div key={image.id} className={cls.thumb}>
                      <img src={image.previewUrl} alt={image.name} onClick={() => { setPreview(image) }} />
                      <button type="button" className={cls.thumbRemove} aria-label="移除图片" onClick={(event) => {
                        event.stopPropagation()
                        if (preview?.id === image.id) setPreview(null)
                        URL.revokeObjectURL(image.previewUrl)
                        setImages((current) => current.filter((entry) => entry.id !== image.id))
                      }}>×</button>
                    </div>
                  ))}
                </div>
              )}
              <div className={cls.inputWrap}>
              <textarea
                ref={inputRef}
                className={cls.textarea}
                value={draft}
                rows={1}
                placeholder="跟小管家说点什么…"
                aria-label="消息输入"
                onChange={(event) => { setDraft(event.currentTarget.value) }}
                onPaste={onPaste}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault()
                    send()
                  }
                }}
              />
              </div>
              <div className={cls.row}>
                <div className={cls.tools}>
                  <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(event) => { onFiles(event.currentTarget.files); event.currentTarget.value = '' }} />
                  <button type="button" className={cls.add} aria-label="添加图片" onClick={() => { fileRef.current?.click() }}>+</button>
                  <button type="button" className={cls.taskAction} disabled={snapshot?.taskReferenceAvailable === false} onClick={() => { setTaskPickerOpen((value) => !value) }}>引用任务</button>
                </div>
                <div className={cls.trailing}>
                  <AssistantModelSelect
                    model={model}
                    onSelect={(modelId, effort, provider) => {
                      void controller.setModel(modelId, effort, provider).then((error) => {
                        if (error !== undefined) setSendError(error)
                        else setSendError(null)
                      })
                    }}
                  />
                  <AssistantContextMeter context={context} />
                  <button type="submit" className={cls.send} disabled={!canSend} aria-label="发送">
                    <svg viewBox="0 0 16 16" width="14" height="14" fill="none" aria-hidden="true">
                      <path d="M8 13V3M4 7l4-4 4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          </form>
        </div>
      )}
      <div
        className={!open && lastSeenSeq !== null && (snapshot?.seq ?? 0) > lastSeenSeq ? `${cls.pet} ${cls.petUnread}` : cls.pet}
        style={{ bottom: anchorBottom }}
        role="button"
        tabIndex={0}
        aria-label={open ? '收起助理' : '展开助理'}
        aria-expanded={open}
        onClick={() => {
          setOpen((value) => {
            const next = !value
            if (next) {
              const seq = controller.getSnapshot()?.seq ?? 0
              setLastSeenSeq(seq)
              const id = controller.getSnapshot()?.sessionId
              if (id !== undefined) writeLastSeenSeq(id, seq)
            }
            return next
          })
        }}
        onKeyDown={(event) => {
          if (event.key !== 'Enter' && event.key !== ' ') return
          event.preventDefault()
          setOpen((value) => !value)
        }}
      >
        <WhaleMark className={cls.petIcon} />
      </div>
      {preview !== null && (
        <div className={cls.lightbox} role="dialog" aria-label={preview.name} onClick={() => { setPreview(null) }}>
          <button type="button" className={cls.lightboxClose} aria-label="关闭" onClick={() => { setPreview(null) }}>×</button>
          <img className={cls.lightboxImg} src={preview.previewUrl} alt={preview.name} onClick={(event) => { event.stopPropagation() }} />
        </div>
      )}
    </div>
  )
}

function TimelineRow({ item, controller, onOpenImage }: {
  item: TimelineItem
  controller: AssistantController
  onOpenImage: (url: string, alt: string) => void
}): JSX.Element {
  if (item.kind === 'user') {
    return (
      <div className={cls.userRow}>
        {item.images !== undefined && item.images.length > 0 && (
          <div className={cls.userImages}>
            {item.images.map((image) => (
              <ChatImage key={image.attachmentId} image={image} controller={controller} onOpen={onOpenImage} />
            ))}
          </div>
        )}
        {item.text !== '' && <div className={cls.userBubble}>{item.text}</div>}
      </div>
    )
  }
  if (item.kind === 'task-reference') {
    const omitted = item.receipt.omittedSessions > 0 ? ' · 省略 ' + String(item.receipt.omittedSessions) + ' 条' : ''
    return <div className={cls.taskMarker}>已引用任务 · {item.receipt.label} · {String(item.receipt.sourceSessionIds.length)} 条来源{omitted}</div>
  }
  if (item.kind === 'error') {
    return <div className={cls.error}>{item.text}</div>
  }
  if (item.kind === 'tool') {
    return (
      <div className={cls.tool} data-state={item.status} data-tool={item.name}>
        <div className={cls.toolRow}>
          <span className={cls.toolTitle}>{item.name}</span>
          {item.summary !== '' && <span className={cls.toolSep} />}
          {item.summary !== '' && <span className={cls.toolSummary}>{item.summary}</span>}
        </div>
      </div>
    )
  }
  return <div className={cls.assistant}><MiniMarkdown text={item.text} /></div>
}

function messagesAsItems(messages: readonly { seq: number; role: 'user' | 'assistant'; text: string; source: string; time: number }[]): TimelineItem[] {
  return messages.map((message) => message.role === 'user'
    ? { kind: 'user', seq: message.seq, text: message.text, time: message.time, source: message.source }
    : { kind: 'assistant', seq: message.seq, text: message.text, time: message.time })
}

function ChatImage({ image, controller, onOpen }: {
  image: ChatImageRef
  controller: AssistantController
  onOpen: (url: string, alt: string) => void
}): JSX.Element {
  const [url, setUrl] = useState<string | undefined>(undefined)
  useEffect(() => {
    let revoked: string | undefined
    void controller.readImage(image.attachmentId).then((loaded) => {
      if (loaded === undefined) return
      revoked = 'data:' + loaded.mediaType + ';base64,' + loaded.dataBase64
      setUrl(revoked)
    })
    return () => { /* data URLs do not need revoke */ }
  }, [controller, image.attachmentId])
  if (url === undefined) return <span className={cls.thumb} />
  return <img src={url} alt={image.name ?? 'image'} onClick={() => { onOpen(url, image.name ?? 'image') }} />
}

const PET_DEFAULT_BOTTOM = 8

/** Align with the main composer only while it is docked. Hero / new-session
 *  centers the card mid-column; following that bottom would lift the whale. */
function measurePetBottom(card: HTMLElement): number {
  const phase = card.closest('[data-phase]')?.getAttribute('data-phase')
  if (phase !== 'active') return PET_DEFAULT_BOTTOM
  return Math.max(0, Math.round(window.innerHeight - card.getBoundingClientRect().bottom))
}

const TASK_BINDING_KEY = 'dsh-llm-assistant.taskBinding'
const LAST_SEEN_KEY = 'dsh-llm-assistant.lastSeenSeq'

function readTaskBinding(): TaskBinding | undefined {
  try {
    const raw = window.localStorage.getItem(TASK_BINDING_KEY)
    if (raw === null) return undefined
    const value = JSON.parse(raw) as Partial<TaskBinding>
    if (typeof value.sessionId !== 'string' || typeof value.label !== 'string') return undefined
    return {
      sessionId: value.sessionId,
      label: value.label,
      refresh: value.refresh !== false,
      ...(typeof value.assistantSessionId === 'string' ? { assistantSessionId: value.assistantSessionId } : {}),
    }
  } catch {
    return undefined
  }
}

function writeTaskBinding(task: TaskBinding | undefined): void {
  try {
    if (task === undefined) window.localStorage.removeItem(TASK_BINDING_KEY)
    else window.localStorage.setItem(TASK_BINDING_KEY, JSON.stringify(task))
  } catch {
    // Private mode / quota — binding remains active for this page only.
  }
}

function readLastSeenSeq(sessionId: string): number | null {
  try {
    const raw = window.localStorage.getItem(LAST_SEEN_KEY + '.' + sessionId)
    if (raw === null) return null
    const seq = Number(raw)
    return Number.isFinite(seq) ? seq : null
  } catch {
    return null
  }
}

function writeLastSeenSeq(sessionId: string, seq: number): void {
  try {
    window.localStorage.setItem(LAST_SEEN_KEY + '.' + sessionId, String(seq))
  } catch {
    // Private mode / quota — unread just won't persist across refresh.
  }
}

function isImageFile(file: File): boolean {
  if (file.type.startsWith('image/')) return true
  return /\.(png|jpe?g|webp|gif|bmp)$/i.test(file.name)
}

async function readDraftImage(file: File): Promise<DraftImage> {
  const previewUrl = URL.createObjectURL(file)
  const compressed = await compressImage(file)
  return {
    id: file.name + String(file.size) + String(file.lastModified),
    name: file.name,
    mediaType: compressed.mediaType,
    dataBase64: compressed.dataBase64,
    previewUrl,
  }
}

async function compressImage(file: File): Promise<{ mediaType: string; dataBase64: string }> {
  try {
    const bitmap = await createImageBitmap(file)
    const max = 1600
    const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(bitmap.width * scale))
    canvas.height = Math.max(1, Math.round(bitmap.height * scale))
    const ctx = canvas.getContext('2d')
    if (ctx === null) return bytesToPayload(file, await file.arrayBuffer())
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    const blob = await new Promise<Blob | null>((resolve) => { canvas.toBlob(resolve, 'image/jpeg', 0.82) })
    if (blob === null) return bytesToPayload(file, await file.arrayBuffer())
    return { mediaType: 'image/jpeg', dataBase64: await blobToBase64(blob) }
  } catch {
    return bytesToPayload(file, await file.arrayBuffer())
  }
}

function bytesToPayload(file: File, buffer: ArrayBuffer): { mediaType: string; dataBase64: string } {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return { mediaType: file.type || 'image/png', dataBase64: btoa(binary) }
}

async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer()
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}
