/** 席位与缩小版对话列样式。颜色一律走 DSH design-platform token。 */

const STYLE_ID = 'dsh-llm-assistant-styles'

export const cls = {
  "root": "dsh-assistant-root",
  "pet": "dsh-assistant-pet",
  "petUnread": "dsh-assistant-pet-unread",
  "petIcon": "dsh-assistant-pet-icon",
  "panel": "dsh-assistant-panel",
  "panelHead": "dsh-assistant-panel-head",
  "panelTitle": "dsh-assistant-panel-title",
  "panelBody": "dsh-assistant-panel-body",
  "close": "dsh-assistant-close",
  "status": "dsh-assistant-status",
  "empty": "dsh-assistant-empty",
  "error": "dsh-assistant-error",
  "thinking": "dsh-assistant-thinking",
  "thinkingLabel": "dsh-assistant-thinking-label",
  "column": "dsh-assistant-column",
  "userRow": "dsh-assistant-user-row",
  "userBubble": "dsh-assistant-user-bubble",
  "userImages": "dsh-assistant-user-images",
  "assistant": "dsh-assistant-md",
  "tool": "dsh-assistant-tool",
  "toolRow": "dsh-assistant-tool-row",
  "toolTitle": "dsh-assistant-tool-title",
  "toolSep": "dsh-assistant-tool-sep",
  "toolSummary": "dsh-assistant-tool-summary",
  "dock": "dsh-assistant-dock",
  "dockTitle": "dsh-assistant-dock-title",
  "dockItem": "dsh-assistant-dock-item",
  "composer": "dsh-assistant-composer",
  "card": "dsh-assistant-card",
  "textarea": "dsh-assistant-textarea",
  "inputWrap": "dsh-assistant-input-wrap",
  "rail": "dsh-assistant-rail",
  "taskMarker": "dsh-assistant-task-marker",
  "thumb": "dsh-assistant-thumb",
  "thumbRemove": "dsh-assistant-thumb-x",
  "lightbox": "dsh-assistant-lightbox",
  "lightboxImg": "dsh-assistant-lightbox-img",
  "lightboxClose": "dsh-assistant-lightbox-x",
  "row": "dsh-assistant-row",
  "tools": "dsh-assistant-tools",
  "trailing": "dsh-assistant-trailing",
  "add": "dsh-assistant-add",
  "newConversation": "dsh-assistant-new-conversation",
  "msRoot": "dsh-assistant-ms",
  "msTrigger": "dsh-assistant-ms-trigger",
  "msTriggerLabel": "dsh-assistant-ms-trigger-label",
  "msTriggerEffort": "dsh-assistant-ms-trigger-effort",
  "msChevron": "dsh-assistant-ms-chevron",
  "msChevronOpen": "dsh-assistant-ms-chevron-open",
  "msMenu": "dsh-assistant-ms-menu",
  "msCell": "dsh-assistant-ms-cell",
  "msCellLabel": "dsh-assistant-ms-cell-label",
  "msCellValue": "dsh-assistant-ms-cell-value",
  "msCellChevron": "dsh-assistant-ms-cell-chevron",
  "msGroups": "dsh-assistant-ms-groups",
  "msOption": "dsh-assistant-ms-option",
  "msOptionCopy": "dsh-assistant-ms-option-copy",
  "msSelected": "dsh-assistant-ms-selected",
  "msCheck": "dsh-assistant-ms-check",
  "msStatus": "dsh-assistant-ms-status",
  "msGroupTitle": "dsh-assistant-ms-group-title",
  "cmRoot": "dsh-assistant-cm",
  "cmTrigger": "dsh-assistant-cm-trigger",
  "cmTrack": "dsh-assistant-cm-track",
  "cmFill": "dsh-assistant-cm-fill",
  "cmPanel": "dsh-assistant-cm-panel",
  "cmHeader": "dsh-assistant-cm-header",
  "cmPercent": "dsh-assistant-cm-percent",
  "cmHeadline": "dsh-assistant-cm-headline",
  "cmFigures": "dsh-assistant-cm-figures",
  "cmBar": "dsh-assistant-cm-bar",
  "cmSegment": "dsh-assistant-cm-segment",
  "cmSwatch": "dsh-assistant-cm-swatch",
  "cmSystem": "dsh-assistant-cm-system",
  "cmTools": "dsh-assistant-cm-tools",
  "cmMessages": "dsh-assistant-cm-messages",
  "cmRows": "dsh-assistant-cm-rows",
  "cmRow": "dsh-assistant-cm-row",
  "send": "dsh-assistant-send",
  "resize": "dsh-assistant-resize",
  "md": "dsh-assistant-markdown"
} as const

const CSS = `
.dsh-assistant-root { position:absolute; inset:0; pointer-events:none; z-index:40; }
.dsh-assistant-pet-unread::after { content:""; position:absolute; top:2px; right:2px; width:8px; height:8px; border-radius:50%; background:var(--dsw-alias-danger, #e24); box-shadow:0 0 0 2px var(--dsw-alias-button-floating-fill); }
.dsh-assistant-pet { position:absolute; right:20px; bottom:8px; width:42px; height:42px; border-radius:50%; border:1px solid var(--dsw-alias-border-l2); background:var(--dsw-alias-button-floating-fill); box-shadow:0 0 0 1px var(--dsw-alias-bg-mask-2), 0 8px 18px var(--dsw-alias-bg-mask-2), 0 16px 32px var(--dsw-alias-bg-mask-3); display:grid; place-items:center; cursor:pointer; pointer-events:auto; transition:transform var(--ds-transition-duration) var(--ds-ease-in-out), box-shadow var(--ds-transition-duration) var(--ds-ease-in-out), background var(--ds-transition-duration) var(--ds-ease-in-out); user-select:none; }
.dsh-assistant-pet:hover { transform:translateY(-2px); box-shadow:0 0 0 1px var(--dsw-alias-bg-mask-2), 0 12px 24px var(--dsw-alias-bg-mask-3), 0 20px 40px var(--dsw-alias-bg-mask-3); background:var(--dsw-alias-button-floating-hover); }
.dsh-assistant-pet:active { transform:translateY(0); }
.dsh-assistant-pet-icon { width:28px; height:28px; color:var(--dsw-alias-brand-primary); }
.dsh-assistant-panel { position:absolute; right:72px; bottom:8px; width:368px; height:483px; min-width:300px; min-height:322px; max-width:calc(100% - 96px); max-height:calc(100% - 16px); display:flex; flex-direction:column; border-radius:14px; border:1px solid var(--dsw-alias-border-l2); background:var(--dsw-alias-bg-layer-1); box-shadow:0 0 0 1px var(--dsw-alias-bg-mask-2), 0 12px 28px var(--dsw-alias-bg-mask-2), 0 28px 64px var(--dsw-alias-bg-mask-3); pointer-events:auto; overflow:visible; color:var(--dsw-alias-label-primary); font-size:14px; }
.dsh-assistant-panel-head { display:flex; align-items:center; gap:6px; padding:9px 12px 9px 14px; border-bottom:1px solid var(--dsw-alias-border-l2); }
.dsh-assistant-panel-title { flex:1; min-width:0; font-weight:600; font-size:14px; line-height:20px; }
.dsh-assistant-status { font-weight:500; font-size:11px; color:var(--dsw-alias-state-business-primary); padding:1px 7px; border-radius:999px; background:var(--dsw-alias-state-business-tertiary); }
.dsh-assistant-close { border:0; background:transparent; cursor:pointer; font-size:15px; line-height:1; padding:2px 6px; border-radius:6px; color:var(--dsw-alias-label-tertiary); }
.dsh-assistant-close:hover { background:var(--dsw-alias-interactive-bg-hover); }
.dsh-assistant-panel-body { flex:1; min-height:0; overflow-y:auto; padding:12px 14px 8px; }
.dsh-assistant-column { display:flex; flex-direction:column; gap:12px; }
.dsh-assistant-error { margin: 0 4px; padding: 8px 10px; border-radius: 10px; background: var(--dsw-alias-danger-bg, color-mix(in srgb, var(--dsw-alias-danger, #e24) 12%, transparent)); color: var(--dsw-alias-danger, #c33); font-size: 13px; line-height: 20px; }
.dsh-assistant-thinking { margin: 0 4px; color: var(--dsw-alias-label-tertiary); font-size: 12px; line-height: 18px; white-space: pre-wrap; }
.dsh-assistant-thinking-label { display: inline-block; margin-right: 6px; font-weight: 600; color: var(--dsw-alias-label-secondary); }
.dsh-assistant-empty { margin:auto; text-align:center; color:var(--dsw-alias-label-tertiary); font-size:13px; line-height:20px; padding:28px 12px; }
.dsh-assistant-user-row { display:flex; flex-direction:column; align-items:flex-end; gap:4px; }
.dsh-assistant-user-bubble { max-width:86%; background:var(--dsw-specific-bubble); border-radius:16px; padding:7px 12px; font-size:14px; line-height:21px; color:var(--dsw-alias-label-primary); white-space:pre-wrap; overflow-wrap:anywhere; }
.dsh-assistant-user-images { display:flex; flex-wrap:wrap; justify-content:flex-end; gap:6px; }
.dsh-assistant-user-images img { width:72px; height:72px; object-fit:cover; border-radius:10px; cursor:zoom-in; display:block; }
.dsh-assistant-md { max-width:100%; min-width:0; }
.dsh-assistant-tool { display:flex; flex-direction:column; }
.dsh-assistant-tool[data-state="running"] .dsh-assistant-tool-row { position:relative; overflow:hidden; }
.dsh-assistant-tool-row { display:flex; align-items:center; min-height:22px; color:var(--dsw-alias-label-secondary); font-size:13px; line-height:22px; }
.dsh-assistant-tool-title { flex:none; color:var(--dsw-alias-label-primary); }
.dsh-assistant-tool-sep { flex:none; width:2px; height:2px; margin:0 8px; border-radius:1px; background:var(--dsw-alias-label-caption); }
.dsh-assistant-tool-summary { flex:1 1 auto; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:var(--dsw-alias-label-tertiary); }
.dsh-assistant-dock { margin:0 10px 6px; padding:6px 8px; border:1px solid var(--dsw-alias-border-l2); border-radius:10px; background:var(--dsw-alias-bg-layer-2); }
.dsh-assistant-dock-title { font-size:11px; font-weight:600; color:var(--dsw-alias-label-secondary); margin-bottom:4px; }
.dsh-assistant-dock-item { display:flex; gap:6px; font-size:11px; line-height:16px; color:var(--dsw-alias-label-primary); }
.dsh-assistant-dock-item[data-status="completed"] { color:var(--dsw-alias-label-tertiary); text-decoration:line-through; }
.dsh-assistant-dock-item[data-status="in_progress"] { color:var(--dsw-alias-state-business-primary); }
.dsh-assistant-composer { flex:none; padding:0 10px 8px; }
.dsh-assistant-card { position:relative; display:flex; flex-direction:column; gap:4px; padding-top:6px; border:1px solid var(--dsw-alias-border-l2-darkmode-thin); border-radius:16px; background:var(--dsw-specific-input-major); }
.dsh-assistant-input-wrap { overflow:hidden; }
.dsh-assistant-textarea { display:block; box-sizing:border-box; width:100%; height:21px; min-height:21px; max-height:126px; overflow-x:hidden; overflow-y:hidden; resize:none; border:0; outline:none; background:transparent; color:var(--dsw-alias-label-primary); font:inherit; font-size:14px; line-height:21px; padding:0 14px; }
.dsh-assistant-textarea::placeholder { color:var(--dsw-alias-label-tertiary); }
.dsh-assistant-rail { display:flex; gap:8px; padding:10px 16px 4px; overflow-x:auto; overflow-y:hidden; }
.dsh-assistant-thumb { position:relative; width:56px; height:56px; flex:none; cursor:zoom-in; }
.dsh-assistant-thumb img { width:56px; height:56px; object-fit:cover; border-radius:10px; display:block; }
.dsh-assistant-thumb-x { position:absolute; top:2px; right:2px; width:18px; height:18px; border:0; border-radius:50%; background:var(--dsw-alias-button-primary-fill); color:var(--dsw-alias-label-primary-foreground); font-size:12px; line-height:18px; cursor:pointer; z-index:1; }
.dsh-assistant-lightbox { position:fixed; inset:0; z-index:80; display:grid; place-items:center; background:var(--dsw-alias-bg-mask-3); pointer-events:auto; cursor:zoom-out; }
.dsh-assistant-lightbox-img { max-width:min(90vw, 960px); max-height:90vh; border-radius:12px; box-shadow:0 16px 48px var(--dsw-alias-bg-mask-3); }
.dsh-assistant-lightbox-x { position:absolute; top:16px; right:16px; width:32px; height:32px; border:0; border-radius:50%; background:var(--dsw-alias-button-primary-fill); color:var(--dsw-alias-label-primary-foreground); font-size:18px; cursor:pointer; }
.dsh-assistant-row { display:flex; align-items:center; justify-content:space-between; gap:8px; padding:0 6px 6px; }
.dsh-assistant-tools, .dsh-assistant-trailing { display:flex; align-items:center; gap:6px; min-width:0; height:28px; }
.dsh-assistant-trailing { flex:1 1 auto; justify-content:flex-end; margin-left:auto; }
.dsh-assistant-add { display:grid; place-items:center; width:28px; height:28px; border:none; border-radius:999px; background:var(--dsw-specific-selector); color:var(--dsw-alias-label-primary); cursor:pointer; font-size:18px; line-height:1; }
.dsh-assistant-add:hover:not(:disabled) { background:var(--dsw-alias-interactive-bg-hover-solid); }
.dsh-assistant-new-conversation { flex:none; height:24px; padding:0 7px; border:1px solid var(--dsw-alias-border-l2); border-radius:999px; background:transparent; color:var(--dsw-alias-label-secondary); font-size:12px; line-height:22px; white-space:nowrap; cursor:pointer; }
.dsh-assistant-new-conversation:hover:not(:disabled) { background:var(--dsw-alias-interactive-bg-hover); color:var(--dsw-alias-label-primary); }
.dsh-assistant-new-conversation[data-warning="true"] { border-color:var(--dsw-alias-danger, #e24); color:var(--dsw-alias-danger, #e24); }
.dsh-assistant-new-conversation:disabled { opacity:.45; cursor:not-allowed; }
.dsh-assistant-ms { position:relative; min-width:0; flex:none; max-width:160px; }
.dsh-assistant-ms-trigger { display:flex; align-items:center; gap:4px; min-width:0; max-width:160px; height:28px; padding:0 4px 0 8px; border:none; border-radius:24px; outline:none; background:transparent; color:var(--dsw-alias-label-secondary); font-size:13px; line-height:20px; font-weight:500; cursor:pointer; }
.dsh-assistant-ms-trigger:hover { background:var(--dsw-alias-interactive-bg-hover); }
.dsh-assistant-ms-trigger-label { min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.dsh-assistant-ms-trigger-effort { flex:none; color:var(--dsw-alias-label-caption); }
.dsh-assistant-ms-chevron { flex:none; color:var(--dsw-alias-label-caption); transition:transform 120ms ease; }
.dsh-assistant-ms-chevron-open { transform:rotate(180deg); }
.dsh-assistant-ms-menu { position:absolute; right:0; bottom:calc(100% + 8px); z-index:30; display:flex; flex-direction:column; width:min(240px, calc(100vw - 32px)); max-height:min(360px, calc(100vh - 96px)); overflow:hidden; padding:4px; border:1px solid var(--dsw-alias-border-inverted); border-radius:12px; background:var(--dsw-specific-menu); box-shadow:var(--dsw-shadow-lv3); color:var(--dsw-alias-label-primary); }
.dsh-assistant-ms-cell { display:flex; align-items:center; gap:8px; width:100%; height:40px; padding:0 10px; border:none; border-radius:10px; background:transparent; color:var(--dsw-alias-label-primary); font-size:14px; line-height:22px; cursor:pointer; text-align:left; }
.dsh-assistant-ms-cell:hover { background:var(--dsw-alias-interactive-bg-hover); }
.dsh-assistant-ms-cell-label { flex:1 1 auto; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.dsh-assistant-ms-cell-value { flex:0 1 auto; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:var(--dsw-alias-label-tertiary); }
.dsh-assistant-ms-cell-chevron { flex:none; color:var(--dsw-alias-label-tertiary); }
.dsh-assistant-ms-groups { min-height:0; overflow-y:auto; }
.dsh-assistant-ms-option { display:flex; align-items:center; gap:8px; width:100%; min-height:38px; padding:6px 8px; border:none; border-radius:10px; outline:none; background:transparent; color:inherit; text-align:left; cursor:pointer; }
.dsh-assistant-ms-option:hover { background:var(--dsw-alias-interactive-bg-hover); }
.dsh-assistant-ms-option-copy { flex:1; min-width:0; overflow:hidden; font-size:14px; line-height:22px; text-overflow:ellipsis; white-space:nowrap; }
.dsh-assistant-ms-check { flex:none; width:18px; color:var(--dsw-alias-label-primary); }
.dsh-assistant-ms-status { padding:10px; color:var(--dsw-alias-label-tertiary); font-size:13px; line-height:20px; }
.dsh-assistant-ms-group-title { position:sticky; top:0; z-index:1; padding:5px 8px 3px; background:var(--dsw-specific-menu); color:var(--dsw-alias-label-tertiary); font-size:12px; line-height:18px; font-weight:500; }
.dsh-assistant-cm { position:relative; display:inline-flex; }
.dsh-assistant-cm-trigger { display:grid; place-items:center; flex:none; width:28px; height:28px; border:none; border-radius:999px; background:transparent; color:var(--dsw-alias-label-secondary); cursor:pointer; }
.dsh-assistant-cm-trigger:hover { background:var(--dsw-alias-interactive-bg-hover); }
.dsh-assistant-cm-track { fill:none; stroke:var(--dsw-alias-border-l3); stroke-width:2; }
.dsh-assistant-cm-fill { fill:none; stroke:var(--dsw-alias-label-tertiary); stroke-width:2; stroke-linecap:round; }
.dsh-assistant-cm-panel { position:absolute; bottom:calc(100% + 8px); right:0; z-index:100; box-sizing:border-box; width:264px; padding:12px; border:1px solid var(--dsw-alias-border-inverted); border-radius:12px; background:var(--dsw-specific-menu); box-shadow:var(--dsw-shadow-lv3); font-size:12px; line-height:20px; color:var(--dsw-alias-label-secondary); cursor:default; }
.dsh-assistant-cm-header { display:flex; align-items:center; gap:6px; }
.dsh-assistant-cm-figures { margin-left:auto; font-weight:500; font-variant-numeric:tabular-nums; color:var(--dsw-alias-label-primary); }
.dsh-assistant-cm-percent { font-weight:500; color:var(--dsw-alias-label-primary); }
.dsh-assistant-cm-headline { color:var(--dsw-alias-label-tertiary); }
.dsh-assistant-cm-bar { display:flex; gap:1px; margin:10px 0 12px; height:4px; border-radius:999px; background:var(--dsw-alias-interactive-bg-hover); overflow:hidden; }
.dsh-assistant-cm-segment { flex:none; min-width:2px; height:100%; border-radius:1px; background:var(--meter-tint, var(--dsw-alias-label-tertiary)); }
.dsh-assistant-cm-swatch { display:inline-block; margin-right:6px; width:8px; height:8px; border-radius:2px; background:var(--meter-tint); vertical-align:baseline; }
.dsh-assistant-cm-system { --meter-tint: var(--dsw-static-neutral-bluish-400); }
.dsh-assistant-cm-tools { --meter-tint: rgb(167, 139, 250); }
.dsh-assistant-cm-messages { --meter-tint: var(--dsw-static-blue-450); }
.dsh-assistant-cm-rows { margin:6px 0 0; }
.dsh-assistant-cm-row { display:flex; align-items:center; justify-content:space-between; gap:12px; padding:2px 0; }
.dsh-assistant-cm-row dt { color:var(--dsw-alias-label-secondary); }
.dsh-assistant-cm-row dd { margin:0; font-variant-numeric:tabular-nums; color:var(--dsw-alias-label-primary); }
.dsh-assistant-task-marker { align-self:flex-start; max-width:100%; padding:4px 8px; border-radius:7px; background:var(--dsw-alias-bg-layer-2); color:var(--dsw-alias-label-tertiary); font-size:11px; line-height:16px; }
.dsh-assistant-send { display:grid; place-items:center; width:28px; height:28px; border:none; border-radius:999px; background:var(--dsw-alias-button-info-fill); color:#fff; cursor:pointer; }
.dsh-assistant-send:disabled { opacity:0.4; cursor:default; }
.dsh-assistant-resize { position:absolute; top:0; left:0; width:16px; height:16px; cursor:nwse-resize; pointer-events:auto; background:transparent; }
.dsh-assistant-markdown { min-width:0; overflow-wrap:anywhere; font:var(--dsw-font-markdown-base); font-size:14px; line-height:21px; color:var(--dsw-alias-label-primary); }
.dsh-assistant-markdown p { margin:8px 0; }
.dsh-assistant-markdown p:first-child { margin-top:0; }
.dsh-assistant-markdown p:last-child { margin-bottom:0; }
.dsh-assistant-markdown h1,.dsh-assistant-markdown h2,.dsh-assistant-markdown h3 { font:var(--dsw-font-markdown-h3); margin:16px 0 8px; }
.dsh-assistant-markdown a { color:var(--dsw-alias-state-business-primary); text-decoration:none; }
.dsh-assistant-markdown code { font-family:var(--ds-font-family-code); background:var(--dsw-alias-markdown-inline-code); border-radius:4px; padding:0 4px; }
.dsh-assistant-markdown pre { margin:8px 0; padding:10px 12px; border-radius:10px; background:var(--dsw-alias-bg-layer-2); overflow-x:auto; }
.dsh-assistant-markdown pre code { background:transparent; padding:0; }
.dsh-assistant-markdown ul,.dsh-assistant-markdown ol { margin:8px 0; padding-left:1.4em; }
.dsh-assistant-markdown blockquote { margin:8px 0; padding-left:12px; border-left:3px solid var(--dsw-alias-border-l3); color:var(--dsw-alias-label-secondary); }
.dsh-assistant-markdown table { border-collapse:collapse; width:100%; font:var(--dsw-font-markdown-table); }
.dsh-assistant-markdown th,.dsh-assistant-markdown td { border:1px solid var(--dsw-alias-border-l2); padding:6px 8px; text-align:left; }
.dsh-assistant-markdown th { font:var(--dsw-font-markdown-table-head); background:var(--dsw-alias-bg-layer-2); }
`

/** 注入样式表；已存在则覆盖，便于热更新。 */
export function ensureAssistantStyles(): void {
  let style = document.getElementById(STYLE_ID) as HTMLStyleElement | null
  if (style === null) {
    style = document.createElement('style')
    style.id = STYLE_ID
    document.head.append(style)
  }
  style.textContent = CSS
}
