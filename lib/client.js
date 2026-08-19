window.__ModuleLoader__.load({
	id: "dsh-llm-assistant",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let _deepseek_ai_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");
		let react_jsx_runtime = require("react/jsx-runtime");
		//#region src/contract.ts
		/**
		* Host/client RPC contract for the resident assistant seat (T1.2).
		*
		* The assistant session is owned by the host plugin (one session, id persisted
		* since T1.1), so requests carry no sessionId — the host resolves its own
		* assistant. Transport is the Connection generic RPC: the client POSTs
		* `{type:'client-request', rpcId, method, payload}` to `/{channel}/{endpoint}`
		* and the host replies with `{type:'server-response', rpcId, result}`.
		*/
		const ASSISTANT_RPC_CHANNEL = "/llm-assistant";
		const ASSISTANT_EVENTS_ENDPOINT = "/llm-assistant/events";
		const ASSISTANT_SNAPSHOT_ENDPOINT = "assistant/snapshot";
		const ASSISTANT_SET_MODEL_ENDPOINT = "assistant/set-model";
		const ASSISTANT_IMAGE_ENDPOINT = "assistant/image";
		const ASSISTANT_ROLLOVER_ENDPOINT = "assistant/rollover";
		//#endregion
		//#region src/snapshot-patch.ts
		function applyAssistantSnapshotPatch(snapshot, patch) {
			const next = {
				...snapshot,
				...patch
			};
			for (const key of OPTIONAL_KEYS) if (next[key] === null) delete next[key];
			return next;
		}
		function applyAssistantLiveDelta(snapshot, delta, seq, revision) {
			if (delta.kind === "text") return {
				...snapshot,
				seq,
				revision,
				pending: (snapshot.pending ?? "") + delta.text
			};
			if (delta.kind === "reasoning") return {
				...snapshot,
				seq,
				revision,
				thinking: (snapshot.thinking ?? "") + delta.text
			};
			return {
				...snapshot,
				seq,
				revision,
				currentTool: delta.name
			};
		}
		function applyAssistantStreamFrame(snapshot, frame) {
			if (frame.type === "snapshot") return frame.snapshot;
			if (snapshot === void 0) return void 0;
			if (frame.type === "patch") return applyAssistantSnapshotPatch(snapshot, frame.patch);
			return applyAssistantLiveDelta(snapshot, frame.delta, frame.seq, frame.revision);
		}
		const OPTIONAL_KEYS = [
			"pending",
			"thinking",
			"currentTool",
			"turnStartTime",
			"model",
			"context",
			"todos",
			"goal",
			"taskReferenceAvailable"
		];
		//#endregion
		//#region src/client/controller.ts
		const POLL_INTERVAL_MS = 500;
		const IDLE_POLL_INTERVAL_MS = 4e3;
		var AssistantController = class {
			#rpc;
			#snapshot;
			#listeners = /* @__PURE__ */ new Set();
			#pollTimer;
			#pollMs = IDLE_POLL_INTERVAL_MS;
			#watching = false;
			#fetching = false;
			#fetchEpoch = 0;
			#stream;
			#streamOpen = false;
			constructor(ctx) {
				this.#rpc = ctx.get("connection").rpc;
			}
			getSnapshot = () => this.#snapshot;
			subscribe = (listener) => {
				this.#listeners.add(listener);
				return () => {
					this.#listeners.delete(listener);
				};
			};
			/** Overlay mounted: keep a slow snapshot so the unread mark can move while the panel is closed. */
			watch() {
				this.#watching = true;
				this.#startStream();
				this.#setPoll(IDLE_POLL_INTERVAL_MS);
				this.#fetch();
			}
			/** Overlay unmounted. */
			unwatch() {
				this.#watching = false;
				this.#stopStream();
				this.#stopPolling();
			}
			/** Panel opened: load current state, then poll while the assistant is busy. */
			async open() {
				await this.#fetch();
				if (this.#snapshot?.status === "running" && !this.#streamOpen) this.#setPoll(POLL_INTERVAL_MS);
				else this.#setPoll(IDLE_POLL_INTERVAL_MS);
			}
			/** Panel closed: drop to the idle poll. The host keeps running the turn (AC-CHAT-4). */
			close() {
				this.#setPoll(IDLE_POLL_INTERVAL_MS);
			}
			/** Drive one user message (and optional images) into the assistant session. */
			async send(text, images, currentTask) {
				const trimmed = text.trim();
				if (trimmed.length === 0 && (images === void 0 || images.length === 0)) return false;
				const payload = {
					text: trimmed,
					...images !== void 0 && images.length > 0 ? { images } : {},
					...currentTask === void 0 ? {} : { currentTask }
				};
				if (!(await this.#rpc.call("/llm-assistant", "assistant/send", payload)).ok) return false;
				this.#setPoll(this.#streamOpen ? IDLE_POLL_INTERVAL_MS : POLL_INTERVAL_MS);
				await this.#fetch();
				return true;
			}
			async readImage(attachmentId) {
				const result = await this.#rpc.call(ASSISTANT_RPC_CHANNEL, ASSISTANT_IMAGE_ENDPOINT, { attachmentId });
				if (!result.ok) return void 0;
				return result.value;
			}
			async newConversation() {
				const result = await this.#rpc.call(ASSISTANT_RPC_CHANNEL, ASSISTANT_ROLLOVER_ENDPOINT, {});
				if (!result.ok) return result.error.message;
				const value = result.value;
				const next = await this.#fetch(true);
				if (typeof value.sessionId !== "string" || next?.sessionId !== value.sessionId) return "新对话已创建，但席位快照刷新失败";
			}
			async setModel(model, effort, provider) {
				if (model.trim() === "") return "empty model";
				const result = await this.#rpc.call(ASSISTANT_RPC_CHANNEL, ASSISTANT_SET_MODEL_ENDPOINT, {
					model,
					...effort !== void 0 ? { effort } : {},
					...provider !== void 0 ? { provider } : {}
				});
				if (!result.ok) return result.error.message;
				await this.#fetch();
			}
			#startStream() {
				if (this.#stream !== void 0) return;
				const stream = new EventSource(ASSISTANT_EVENTS_ENDPOINT);
				this.#stream = stream;
				stream.onopen = () => {
					this.#streamOpen = true;
					this.#setPoll(IDLE_POLL_INTERVAL_MS);
				};
				stream.onerror = () => {
					this.#streamOpen = false;
					if (this.#snapshot?.status === "running") this.#setPoll(POLL_INTERVAL_MS);
				};
				stream.onmessage = (event) => {
					try {
						const frame = JSON.parse(event.data);
						if (!isAssistantStreamFrame(frame)) return;
						const next = applyAssistantStreamFrame(this.#snapshot, frame);
						if (next === void 0) return;
						this.#snapshot = next;
						for (const listener of this.#listeners) listener();
					} catch {}
				};
			}
			#stopStream() {
				this.#stream?.close();
				this.#stream = void 0;
				this.#streamOpen = false;
			}
			#setPoll(ms) {
				if (this.#pollTimer !== void 0 && this.#pollMs === ms) return;
				this.#stopPolling();
				this.#pollMs = ms;
				this.#pollTimer = setInterval(() => {
					this.#fetch().then((snapshot) => {
						if (snapshot?.status === "idle" && this.#watching) this.#setPoll(IDLE_POLL_INTERVAL_MS);
						else if (snapshot?.status === "running") this.#setPoll(this.#streamOpen ? IDLE_POLL_INTERVAL_MS : POLL_INTERVAL_MS);
					});
				}, ms);
			}
			#stopPolling() {
				if (this.#pollTimer !== void 0) {
					clearInterval(this.#pollTimer);
					this.#pollTimer = void 0;
				}
			}
			async #fetch(force = false) {
				if (this.#fetching && !force) return this.#snapshot;
				const epoch = ++this.#fetchEpoch;
				this.#fetching = true;
				try {
					const result = await this.#rpc.call(ASSISTANT_RPC_CHANNEL, ASSISTANT_SNAPSHOT_ENDPOINT, {});
					if (!result.ok) return this.#snapshot;
					const snapshot = result.value;
					if (epoch !== this.#fetchEpoch) return this.#snapshot;
					this.#snapshot = snapshot;
					for (const listener of this.#listeners) listener();
					return snapshot;
				} finally {
					if (epoch === this.#fetchEpoch) this.#fetching = false;
				}
			}
		};
		function isAssistantStreamFrame(value) {
			if (typeof value !== "object" || value === null || !("type" in value)) return false;
			const frame = value;
			if (frame.type === "snapshot") return typeof frame.snapshot === "object" && frame.snapshot !== null;
			if (frame.type === "patch") return typeof frame.patch === "object" && frame.patch !== null;
			return frame.type === "delta" && typeof frame.delta === "object" && frame.delta !== null;
		}
		//#endregion
		//#region src/client/css.ts
		/** 席位与缩小版对话列样式。颜色一律走 DSH design-platform token。 */
		const STYLE_ID = "dsh-llm-assistant-styles";
		const cls = {
			"root": "dsh-assistant-root",
			"pet": "dsh-assistant-pet",
			"petUnread": "dsh-assistant-pet-unread",
			"petIcon": "dsh-assistant-pet-icon",
			"panel": "dsh-assistant-panel",
			"panelHead": "dsh-assistant-panel-head",
			"panelTitle": "dsh-assistant-panel-title",
			"panelBody": "dsh-assistant-panel-body",
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
			"iconBtn": "dsh-assistant-icon-btn",
			"actions": "dsh-assistant-actions",
			"action": "dsh-assistant-action",
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
		};
		const CSS = `
.dsh-assistant-root { position:absolute; inset:0; pointer-events:none; z-index:40; }
.dsh-assistant-pet-unread::after { content:""; position:absolute; top:2px; right:2px; width:8px; height:8px; border-radius:50%; background:var(--dsw-alias-danger, #e24); box-shadow:0 0 0 2px var(--dsw-alias-button-floating-fill); }
.dsh-assistant-pet { position:absolute; right:20px; bottom:8px; width:42px; height:42px; border-radius:50%; border:1px solid var(--dsw-alias-border-l2); background:var(--dsw-alias-button-floating-fill); box-shadow:0 0 0 1px var(--dsw-alias-bg-mask-2), 0 8px 18px var(--dsw-alias-bg-mask-2), 0 16px 32px var(--dsw-alias-bg-mask-3); display:grid; place-items:center; cursor:pointer; pointer-events:auto; transition:transform var(--ds-transition-duration) var(--ds-ease-in-out), box-shadow var(--ds-transition-duration) var(--ds-ease-in-out), background var(--ds-transition-duration) var(--ds-ease-in-out); user-select:none; }
.dsh-assistant-pet:hover { transform:translateY(-2px); box-shadow:0 0 0 1px var(--dsw-alias-bg-mask-2), 0 12px 24px var(--dsw-alias-bg-mask-3), 0 20px 40px var(--dsw-alias-bg-mask-3); background:var(--dsw-alias-button-floating-hover); }
.dsh-assistant-pet:active { transform:translateY(0); }
.dsh-assistant-pet-icon { width:28px; height:28px; color:var(--dsw-alias-brand-primary); }
.dsh-assistant-panel { position:absolute; right:72px; bottom:8px; width:368px; height:483px; min-width:300px; min-height:322px; max-width:calc(100% - 96px); max-height:calc(100% - 16px); display:flex; flex-direction:column; border-radius:14px; border:1px solid var(--dsw-alias-border-l2); background:var(--dsw-alias-bg-layer-1); box-shadow:0 0 0 1px var(--dsw-alias-bg-mask-2), 0 12px 28px var(--dsw-alias-bg-mask-2), 0 28px 64px var(--dsw-alias-bg-mask-3); pointer-events:auto; overflow:visible; color:var(--dsw-alias-label-primary); font-size:14px; }
.dsh-assistant-panel[data-maximized] { inset:16px; right:16px; left:16px; top:16px; bottom:16px; width:auto; height:auto; min-width:0; min-height:0; max-width:none; max-height:none; border-radius:12px; }
.dsh-assistant-panel[data-maximized] .dsh-assistant-resize { display:none; }
.dsh-assistant-panel-head { display:flex; align-items:center; gap:4px; padding:9px 10px 9px 14px; border-bottom:1px solid var(--dsw-alias-border-l2); }
.dsh-assistant-panel-title { flex:1; min-width:0; font-weight:600; font-size:14px; line-height:20px; }
.dsh-assistant-status { font-weight:500; font-size:11px; color:var(--dsw-alias-state-business-primary); padding:1px 7px; border-radius:999px; background:var(--dsw-alias-state-business-tertiary); }
.dsh-assistant-panel-body { flex:1; min-height:0; overflow-y:auto; padding:12px 14px 8px; }
.dsh-assistant-column:not([data-official-styles]) { display:flex; flex-direction:column; gap:16px; width:100%; }
.dsh-assistant-flow-item { min-width:0; }
.dsh-assistant-flow-item:empty { display:none; }
.dsh-assistant-error:not([data-official-styles]) { margin:0 4px; padding:8px 10px; border-radius:10px; background:var(--dsw-alias-danger-bg, color-mix(in srgb, var(--dsw-alias-danger, #e24) 12%, transparent)); color:var(--dsw-alias-danger, #c33); font-size:13px; line-height:20px; }
.dsh-assistant-thinking { margin: 0 4px; color: var(--dsw-alias-label-tertiary); font-size: 12px; line-height: 18px; white-space: pre-wrap; }
.dsh-assistant-thinking-label { display: inline-block; margin-right: 6px; font-weight: 600; color: var(--dsw-alias-label-secondary); }
.dsh-assistant-empty { margin:auto; text-align:center; color:var(--dsw-alias-label-tertiary); font-size:13px; line-height:20px; padding:28px 12px; }
.dsh-assistant-user-row:not([data-official-styles]) { display:flex; flex-direction:column; align-items:flex-end; gap:6px; }
.dsh-assistant-user-row:not([data-official-styles]) .dsh-assistant-user-stack { display:flex; flex-direction:column; align-items:flex-end; gap:8px; min-width:0; max-width:82%; }
.dsh-assistant-user-bubble { white-space:pre-wrap; overflow-wrap:anywhere; }
.dsh-assistant-user-row:not([data-official-styles]) .dsh-assistant-user-bubble { max-width:100%; background:var(--dsw-specific-bubble); border-radius:22px; padding:10px 16px; font-size:16px; line-height:24px; color:var(--dsw-alias-label-primary); }
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
.dsh-assistant-icon-btn { display:grid; place-items:center; flex:none; width:22px; height:22px; padding:0; border:0; border-radius:6px; background:transparent; color:var(--dsw-alias-label-tertiary); cursor:pointer; }
.dsh-assistant-icon-btn:hover { background:var(--dsw-alias-interactive-bg-hover); color:var(--dsw-alias-label-primary); }
.dsh-assistant-icon-btn[aria-pressed="true"] { color:var(--dsw-alias-label-primary); }
.dsh-assistant-actions { display:flex; align-items:center; gap:4px; min-height:28px; margin-top:4px; }
.dsh-assistant-actions[data-align="end"] { justify-content:flex-end; }
.dsh-assistant-action { display:inline-flex; align-items:center; justify-content:center; width:28px; height:28px; padding:6px; border:none; border-radius:28px; background:transparent; color:var(--dsw-alias-label-tertiary); cursor:pointer; }
.dsh-assistant-action:hover { background:var(--dsw-alias-interactive-bg-hover); color:var(--dsw-alias-label-secondary); }
.dsh-assistant-action[data-active] { color:var(--dsw-alias-label-primary); }
.dsh-assistant-action[data-unavailable] { cursor:default; opacity:.4; }
.dsh-assistant-action[data-unavailable]:hover { background:transparent; color:var(--dsw-alias-label-tertiary); }
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
/* Standard flow: DSH owns structure/motion through referenced CSS-module classes. Only compact density and Markdown semantics stay local. */
.dsh-assistant-standard-message { min-width:0; max-width:100%; font:var(--dsw-font-xs-13); overflow-wrap:anywhere; }
.dsh-assistant-standard-message .dsh-assistant-standard-message-body > div { font:var(--dsw-font-xs-13); }
.dsh-assistant-standard-message:not([data-official-styles]) { color:var(--dsw-alias-label-primary); display:flex; flex-direction:column; }
.dsh-assistant-standard-message-body { min-width:0; }
.dsh-assistant-standard-message-body:not([data-official-styles]) { display:flex; flex-direction:column; gap:16px; }
.dsh-assistant-standard-message p { margin:0; }
.dsh-assistant-standard-message strong { font:var(--dsw-font-xs-strong-13); }
.dsh-assistant-standard-message em { font:var(--dsw-font-xs-13); font-style:italic; }
.dsh-assistant-standard-message h1,.dsh-assistant-standard-message h2,.dsh-assistant-standard-message h3 { font:var(--dsw-font-xs-strong-13); margin:14px 0 6px; }
.dsh-assistant-standard-message a { color:var(--dsw-alias-state-business-primary); text-decoration:none; }
.dsh-assistant-standard-message code { font:var(--dsw-font-markdown-code-block-small); background:var(--dsw-alias-markdown-inline-code); border-radius:4px; padding:0 4px; }
.dsh-assistant-standard-message pre { max-width:100%; margin:8px 0; padding:12px 16px; border-radius:12px; background:var(--dsw-alias-markdown-code-block, var(--dsw-alias-bg-layer-2)); overflow-x:auto; }
.dsh-assistant-standard-message pre code { background:transparent; padding:0; }
.dsh-assistant-standard-message ul,.dsh-assistant-standard-message ol { margin:8px 0; padding-left:1.4em; }
.dsh-assistant-standard-message blockquote { margin:8px 0; padding-left:12px; border-left:3px solid var(--dsw-alias-border-l3); color:var(--dsw-alias-label-secondary); }
.dsh-assistant-standard-message table { min-width:100%; border-collapse:separate; border-spacing:0; font:var(--dsw-font-xs-13); }
.dsh-assistant-standard-message table th,.dsh-assistant-standard-message table td { border-right:1px solid var(--dsw-alias-border-l2); border-bottom:1px solid var(--dsw-alias-border-l2); padding:8px 12px; text-align:left; white-space:nowrap; }
.dsh-assistant-standard-message table th:first-child,.dsh-assistant-standard-message table td:first-child { border-left:1px solid var(--dsw-alias-border-l2); }
.dsh-assistant-standard-message table thead th { border-top:1px solid var(--dsw-alias-border-l2); font:var(--dsw-font-xs-strong-13); background:var(--dsw-alias-bg-layer-2); }
.dsh-assistant-standard-message table thead th:first-child { border-top-left-radius:8px; }
.dsh-assistant-standard-message table thead th:last-child { border-top-right-radius:8px; }
.dsh-assistant-standard-message table tbody tr:last-child td:first-child { border-bottom-left-radius:8px; }
.dsh-assistant-standard-message table tbody tr:last-child td:last-child { border-bottom-right-radius:8px; }
.dsh-assistant-standard-message div:has(> table) { max-width:100%; overflow-x:auto; }
.dsh-assistant-standard-reasoning,.dsh-assistant-standard-tool { min-width:0; }
.dsh-assistant-standard-reasoning:not([data-official-styles]),.dsh-assistant-standard-tool:not([data-official-styles]) { display:flex; flex-direction:column; }
.dsh-assistant-standard-reasoning:not([data-official-styles]) .dsh-assistant-standard-flow-row,.dsh-assistant-standard-tool:not([data-official-styles]) .dsh-assistant-standard-flow-row { position:relative; overflow:hidden; }
.dsh-assistant-standard-reasoning:not([data-official-styles]) .dsh-assistant-standard-flow-leading,.dsh-assistant-standard-tool:not([data-official-styles]) .dsh-assistant-standard-flow-leading { flex-shrink:0; }
.dsh-assistant-standard-reasoning:not([data-official-styles]) .dsh-assistant-standard-flow-chevron,.dsh-assistant-standard-tool:not([data-official-styles]) .dsh-assistant-standard-flow-chevron { color:var(--dsw-alias-label-secondary); }
.dsh-assistant-standard-reasoning:not([data-official-styles]) .dsh-assistant-standard-flow-title,.dsh-assistant-standard-tool:not([data-official-styles]) .dsh-assistant-standard-flow-title { font-weight:400; }
.dsh-assistant-standard-reasoning:not([data-official-styles]) .dsh-assistant-standard-flow-separator,.dsh-assistant-standard-tool:not([data-official-styles]) .dsh-assistant-standard-flow-separator { flex:none; width:2px; height:2px; margin:0 8px; border-radius:1px; background:var(--dsw-alias-label-caption); }
.dsh-assistant-standard-reasoning:not([data-official-styles]) .dsh-assistant-standard-flow-summary,.dsh-assistant-standard-tool:not([data-official-styles]) .dsh-assistant-standard-flow-summary { flex:1 1 auto; min-width:0; overflow:hidden; color:var(--dsw-alias-label-tertiary); text-overflow:ellipsis; white-space:nowrap; font:var(--dsw-font-markdown-small); }
.dsh-assistant-standard-flow-summary[data-follow-end] { text-overflow:clip; }
.dsh-assistant-standard-reasoning:not([data-official-styles]) .dsh-assistant-standard-reasoning-body { padding:4px 0 4px 22px; color:var(--dsw-alias-label-tertiary); white-space:pre-wrap; word-break:break-word; font:var(--dsw-font-markdown-small); }
.dsh-assistant-standard-tool:not([data-official-styles]) .dsh-assistant-standard-tool-io { display:flex; flex-direction:column; margin:4px 0 4px 22px; border:1px solid var(--dsw-alias-border-l1); border-radius:12px; background:var(--dsw-alias-markdown-code-block); font:var(--dsw-font-markdown-code-block-small); overflow:hidden; }
.dsh-assistant-standard-tool:not([data-official-styles]) .dsh-assistant-standard-tool-io-section { display:grid; grid-template-columns:max-content 1fr; align-items:baseline; column-gap:14px; max-height:150px; padding:12px 16px; overflow-y:auto; }
.dsh-assistant-standard-tool:not([data-official-styles]) .dsh-assistant-standard-tool-io-label { position:sticky; top:0; align-self:start; color:var(--dsw-alias-label-caption); }
.dsh-assistant-standard-tool:not([data-official-styles]) .dsh-assistant-standard-tool-io-text { min-width:0; color:var(--dsw-alias-label-secondary); white-space:pre-wrap; word-break:break-word; }
.dsh-assistant-standard-tool-io-text[data-error] { color:var(--dsw-alias-state-error-primary); }
.dsh-assistant-standard-tool:not([data-official-styles]) .dsh-assistant-standard-tool-divider { flex:none; height:1px; background:var(--dsw-alias-border-l2); }
.dsh-assistant-standard-activity:not([data-official-styles]) { height:26px; font:var(--dsw-font-s-strong-14); white-space:nowrap; color:var(--dsw-static-deepseek-500); display:inline-flex; align-self:flex-start; align-items:center; }
.dsh-assistant-standard-activity-clock { font-variant-numeric:tabular-nums; }
.dsh-assistant-standard-activity:not([data-official-styles]) .dsh-assistant-standard-activity-clock { margin-left:8px; color:var(--dsw-alias-label-caption); font:var(--dsw-font-xs-13); font-weight:400; }
.dsh-assistant-visually-hidden { position:absolute; width:1px; height:1px; padding:0; margin:-1px; overflow:hidden; clip:rect(0 0 0 0); white-space:nowrap; border:0; }
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
`;
		/** 注入样式表；已存在则覆盖，便于热更新。 */
		function ensureAssistantStyles() {
			let style = document.getElementById(STYLE_ID);
			if (style === null) {
				style = document.createElement("style");
				style.id = STYLE_ID;
				document.head.append(style);
			}
			style.textContent = CSS;
		}
		//#endregion
		//#region src/client/WhaleMark.tsx
		/** DSH 官方鲸鱼 mark（取自 apps/web/public/favicon.svg）。fill 走 currentColor，跟随主题。 */
		function WhaleMark({ className }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("svg", {
				className,
				viewBox: "0 0 50 50",
				fill: "none",
				"aria-hidden": "true",
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
					transform: "translate(7 7) scale(.72)",
					d: "M48.8354 10.0479C48.3232 9.79199 48.1025 10.2798 47.8032 10.5278C47.7007 10.6079 47.6143 10.7119 47.5273 10.8076C46.7793 11.624 45.9048 12.1597 44.7622 12.0957C43.0923 12 41.666 12.5356 40.4058 13.8398C40.1377 12.2319 39.2476 11.272 37.8926 10.6558C37.1836 10.3359 36.4668 10.0156 35.9702 9.31982C35.6235 8.82373 35.5293 8.27197 35.356 7.72754C35.2456 7.3999 35.1353 7.06396 34.7651 7.00781C34.3633 6.94385 34.2056 7.2876 34.0479 7.57568C33.418 8.75195 33.1733 10.0479 33.1973 11.3599C33.2524 14.312 34.4736 16.6641 36.8999 18.3359C37.1758 18.5278 37.2466 18.7197 37.1597 19C36.9946 19.5757 36.7974 20.1357 36.624 20.7119C36.5137 21.0801 36.3486 21.1597 35.9624 21C34.6309 20.4321 33.481 19.5918 32.4644 18.5757C30.7393 16.8721 29.1792 14.9917 27.2334 13.52C26.7764 13.1758 26.3193 12.856 25.8467 12.5518C23.8618 10.584 26.1069 8.96777 26.627 8.77588C27.1704 8.57568 26.8159 7.8877 25.0591 7.896C23.3022 7.90381 21.6953 8.50391 19.647 9.30371C19.3477 9.42383 19.0322 9.51172 18.7095 9.58398C16.8501 9.22363 14.9199 9.14355 12.9033 9.37598C9.10596 9.80762 6.07275 11.6396 3.84326 14.7681C1.16455 18.5278 0.53418 22.7998 1.30664 27.2559C2.11768 31.9521 4.46582 35.8398 8.07373 38.8799C11.8159 42.0322 16.1255 43.5762 21.041 43.2803C24.0269 43.104 27.3516 42.6963 31.1016 39.4561C32.0469 39.936 33.0396 40.1279 34.686 40.272C35.9546 40.3921 37.1758 40.208 38.1211 40.0078C39.6021 39.688 39.4995 38.2881 38.9639 38.0322C34.623 35.9678 35.5762 36.8081 34.71 36.1279C36.9155 33.4639 40.2402 30.6958 41.54 21.728C41.6426 21.0161 41.5557 20.5679 41.54 19.9917C41.5322 19.6396 41.6108 19.5039 42.0049 19.4639C43.0923 19.3359 44.1479 19.0317 45.1167 18.4878C47.9292 16.9199 49.064 14.3438 49.3315 11.2559C49.3711 10.7837 49.3237 10.2959 48.8354 10.0479ZM24.3262 37.8398C20.1196 34.4639 18.0791 33.3521 17.2358 33.3999C16.4482 33.4482 16.5898 34.3682 16.7632 34.9678C16.9443 35.5601 17.1812 35.9683 17.5117 36.4878C17.7402 36.832 17.8979 37.3442 17.2832 37.728C15.9282 38.584 13.5728 37.4399 13.4624 37.3838C10.7207 35.7358 8.42822 33.5601 6.81348 30.584C5.25342 27.7197 4.34766 24.6479 4.19775 21.3677C4.1582 20.5757 4.38672 20.2959 5.15869 20.1519C6.17529 19.96 7.22314 19.9199 8.23926 20.0718C12.5327 20.7119 16.1885 22.6719 19.2529 25.7759C21.002 27.5439 22.3252 29.6558 23.6885 31.7202C25.1377 33.9121 26.6978 36 28.6831 37.7119C29.3843 38.312 29.9434 38.7681 30.479 39.104C28.8643 39.2881 26.1699 39.3281 24.3262 37.8398ZM26.3433 24.6001C26.3433 24.248 26.6191 23.9678 26.9658 23.9678C27.0444 23.9678 27.1152 23.9839 27.1782 24.0078C27.2651 24.04 27.3438 24.0879 27.4067 24.1602C27.5171 24.272 27.5801 24.4321 27.5801 24.6001C27.5801 24.9521 27.3042 25.2319 26.9575 25.2319C26.6108 25.2319 26.3433 24.9521 26.3433 24.6001ZM32.6064 27.8799C32.2046 28.0479 31.8027 28.1919 31.4165 28.208C30.8179 28.2397 30.1641 27.9922 29.8096 27.688C29.2583 27.2158 28.8643 26.9521 28.6987 26.1279C28.6279 25.7759 28.6675 25.2319 28.7305 24.9199C28.8721 24.248 28.7144 23.8159 28.2495 23.4238C27.8716 23.104 27.3911 23.0161 26.8633 23.0161C26.666 23.0161 26.4849 22.9277 26.3511 22.856C26.1304 22.7441 25.9492 22.4639 26.1226 22.1201C26.1777 22.0078 26.4458 21.7358 26.5088 21.688C27.2256 21.272 28.0527 21.4077 28.8169 21.7197C29.5259 22.0161 30.0615 22.5601 30.834 23.3281C31.6216 24.2559 31.7632 24.5117 32.2124 25.208C32.5669 25.752 32.8901 26.312 33.1104 26.9521C33.2446 27.3521 33.0713 27.6802 32.6064 27.8799Z",
					fill: "currentColor",
					fillRule: "nonzero"
				})
			});
		}
		//#endregion
		//#region src/client/MessageActions.tsx
		function MessageActions({ text, align, showFeedback = false, feedback, onFeedback, onBranch, branchDisabled = false, zh = true }) {
			const [copied, setCopied] = (0, react.useState)(false);
			const pending = (0, react.useRef)(false);
			const timer = (0, react.useRef)(null);
			(0, react.useEffect)(() => () => {
				pending.current = false;
				if (timer.current !== null) clearTimeout(timer.current);
			}, []);
			const onCopy = (0, react.useCallback)(() => {
				if (copied || pending.current || text.trim() === "") return;
				pending.current = true;
				(0, _deepseek_ai_dsh_client_ui_primitives.writeClipboard)(text).then((ok) => {
					pending.current = false;
					if (!ok) return;
					setCopied(true);
					timer.current = setTimeout(() => {
						timer.current = null;
						setCopied(false);
					}, 1e3);
				});
			}, [copied, text]);
			if (text.trim() === "" && !showFeedback && onBranch === void 0) return null;
			const copyLabel = copied ? zh ? "已复制" : "Copied" : zh ? "复制" : "Copy";
			const likeLabel = feedback === "like" ? zh ? "取消点赞" : "Remove like" : zh ? "点赞" : "Like";
			const dislikeLabel = feedback === "dislike" ? zh ? "取消点踩" : "Remove dislike" : zh ? "点踩" : "Dislike";
			const branchLabel = branchDisabled ? zh ? "回复完成后再分支" : "Wait until the reply finishes" : zh ? "在新对话中分支" : "Branch in a new conversation";
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: cls.actions,
				"data-align": align,
				"data-time-hover-root": true,
				children: [
					text.trim() !== "" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Tooltip, {
						label: copyLabel,
						side: "bottom",
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: cls.action,
							"aria-label": copyLabel,
							onClick: onCopy,
							children: copied ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconCheckOutline16, {}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconCopyOutline16, {})
						})
					}),
					showFeedback && onFeedback !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Tooltip, {
						label: likeLabel,
						side: "bottom",
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: cls.action,
							"aria-label": likeLabel,
							"aria-pressed": feedback === "like",
							"data-active": feedback === "like" || void 0,
							onClick: () => {
								onFeedback("like");
							},
							children: feedback === "like" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconLikeFill16, {}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconLikeOutline16, {})
						})
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Tooltip, {
						label: dislikeLabel,
						side: "bottom",
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: cls.action,
							"aria-label": dislikeLabel,
							"aria-pressed": feedback === "dislike",
							"data-active": feedback === "dislike" || void 0,
							onClick: () => {
								onFeedback("dislike");
							},
							children: feedback === "dislike" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconDislikeFill16, {}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconDislikeOutline16, {})
						})
					})] }),
					onBranch !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Tooltip, {
						label: branchLabel,
						side: "bottom",
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: cls.action,
							"aria-label": zh ? "在新对话中分支" : "Branch in a new conversation",
							"aria-disabled": branchDisabled || void 0,
							"data-unavailable": branchDisabled || void 0,
							onClick: branchDisabled ? void 0 : onBranch,
							children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconBranchOutline16, {})
						})
					})
				]
			});
		}
		function readMessageFeedback(sessionId, seq) {
			try {
				const raw = window.localStorage.getItem("dsh-llm-assistant.feedback." + sessionId + "." + String(seq));
				return raw === "like" || raw === "dislike" ? raw : void 0;
			} catch {
				return;
			}
		}
		function writeMessageFeedback(sessionId, seq, next) {
			try {
				const key = "dsh-llm-assistant.feedback." + sessionId + "." + String(seq);
				if (next === void 0) window.localStorage.removeItem(key);
				else window.localStorage.setItem(key, next);
			} catch {}
		}
		//#endregion
		//#region src/client/official-flow-styles.ts
		const MESSAGE_STYLE_ID = "@deepseek-ai/dsh-client-ui-conversation/AssistantMarkdown.module.css";
		const REASONING_STYLE_ID = "@deepseek-ai/dsh-client-ui-conversation/ReasoningRow.module.css";
		const TOOL_STYLE_ID = "@deepseek-ai/dsh-client-ui-tool/ToolRow.module.css";
		const CHAT_VIEW_STYLE_ID = "@deepseek-ai/dsh-client-ui-conversation/ChatView.module.css";
		const MESSAGE_ITEM_STYLE_ID = "@deepseek-ai/dsh-client-ui-conversation/MessageItem.module.css";
		const MESSAGE_KEYS = [
			"root",
			"body",
			"stopped",
			"actions"
		];
		const REASONING_KEYS = [
			"root",
			"row",
			"leading",
			"chevron",
			"title",
			"separator",
			"summary",
			"thinkBody"
		];
		const TOOL_KEYS = [
			"root",
			"row",
			"leading",
			"chevron",
			"title",
			"sep",
			"summary",
			"errorSummary",
			"ioCard",
			"ioSection",
			"ioDivider",
			"ioLabel",
			"ioText",
			"visuallyHidden"
		];
		const CHAT_VIEW_KEYS = [
			"column",
			"flowItem",
			"turnStatus",
			"turnStatusClock"
		];
		const MESSAGE_ITEM_KEYS = [
			"userRow",
			"userStack",
			"bubble",
			"turnErrorRow",
			"turnErrorDot",
			"turnErrorCopy",
			"turnErrorTitle",
			"turnErrorMessage",
			"turnErrorCode"
		];
		/**
		* Adapter seam over DSH-owned CSS modules. The stable data-plugin-css id and
		* semantic local class suffixes are resolved at runtime; build hashes and all
		* declarations remain owned by the official renderer packages.
		*/
		const officialFlowStyles = {
			message: () => readOfficialCssModule(MESSAGE_STYLE_ID, MESSAGE_KEYS),
			reasoning: () => readOfficialCssModule(REASONING_STYLE_ID, REASONING_KEYS),
			tool: () => readOfficialCssModule(TOOL_STYLE_ID, TOOL_KEYS),
			chatView: () => readOfficialCssModule(CHAT_VIEW_STYLE_ID, CHAT_VIEW_KEYS),
			messageItem: () => readOfficialCssModule(MESSAGE_ITEM_STYLE_ID, MESSAGE_ITEM_KEYS)
		};
		function extractCssModuleClasses(css, keys) {
			const result = {};
			for (const key of keys) {
				if (!/^[a-zA-Z0-9_-]+$/.test(key)) continue;
				const match = css.match(new RegExp("\\.([_a-zA-Z0-9-]+_" + key + ")(?=[\\s,.#:{>\\[])"));
				if (match?.[1] !== void 0) result[key] = match[1];
			}
			return result;
		}
		function classes(...values) {
			return values.filter((value) => typeof value === "string" && value !== "").join(" ");
		}
		const cache = /* @__PURE__ */ new Map();
		function readOfficialCssModule(styleId, keys) {
			if (typeof document === "undefined") return {};
			const css = document.querySelector(`style[data-plugin-css=${JSON.stringify(styleId)}]`)?.textContent ?? "";
			const previous = cache.get(styleId);
			if (previous?.css === css) return previous.classes;
			const resolved = extractCssModuleClasses(css, keys);
			cache.set(styleId, {
				css,
				classes: resolved
			});
			return resolved;
		}
		//#endregion
		//#region src/client/StandardMessage.tsx
		function StandardAssistantMessage({ text, streaming = false, actions }) {
			const styles = officialFlowStyles.message();
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: classes(styles.root, "dsh-assistant-standard-message"),
				"data-official-styles": styles.root !== void 0 || void 0,
				"data-streaming": streaming || void 0,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(StandardFlowBody, { children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.MarkdownText, {
					text,
					streaming,
					codeLabels: CODE_LABELS
				}) }), actions]
			});
		}
		function StandardFlowBody({ children }) {
			const styles = officialFlowStyles.message();
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: classes(styles.body, "dsh-assistant-standard-message-body"),
				"data-official-styles": styles.body !== void 0 || void 0,
				children
			});
		}
		function StandardReasoningRow({ text, running }) {
			const [expanded, setExpanded] = (0, react.useState)(false);
			const summaryRef = (0, react.useRef)(null);
			const summary = running ? latestLine(text) : firstLine(text);
			const styles = officialFlowStyles.reasoning();
			const scheduleSummaryScroll = useThrottledVisualUpdate(() => {
				const element = summaryRef.current;
				if (element !== null) element.scrollLeft = running ? element.scrollWidth - element.clientWidth : 0;
			});
			(0, react.useEffect)(() => {
				scheduleSummaryScroll();
			}, [
				running,
				scheduleSummaryScroll,
				summary
			]);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: classes(styles.root, "dsh-assistant-standard-reasoning"),
				"data-official-styles": styles.root !== void 0 || void 0,
				"data-variant": "think",
				"data-state": running ? "running" : "ok",
				children: [running && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: "dsh-assistant-visually-hidden",
					children: "Running"
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.DisclosureRow, {
					rowClassName: classes(styles.row, "dsh-assistant-standard-flow-row"),
					leadingClassName: classes(styles.leading, "dsh-assistant-standard-flow-leading"),
					titleClassName: classes(styles.title, "dsh-assistant-standard-flow-title"),
					chevronClassName: classes(styles.chevron, "dsh-assistant-standard-flow-chevron"),
					icon: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconThinkOutline14, { size: 14 }),
					title: "Think",
					open: expanded,
					expandable: true,
					expandOnRowClick: true,
					onToggle: () => {
						setExpanded((value) => !value);
					},
					collapsedContent: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: classes(styles.separator, "dsh-assistant-standard-flow-separator"),
						"aria-hidden": true
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						ref: summaryRef,
						className: classes(styles.summary, "dsh-assistant-standard-flow-summary"),
						"data-follow-end": running || void 0,
						children: summary
					})] }),
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: classes(styles.thinkBody, "dsh-assistant-standard-reasoning-body"),
						children: text
					})
				})]
			});
		}
		function StandardToolRow({ name, summary, status, input, output }) {
			const [expanded, setExpanded] = (0, react.useState)(false);
			const state = status === "done" ? "ok" : status;
			const expandable = input !== void 0 || output !== void 0;
			const variant = toolVariant(name);
			const icon = toolIcon(name, state);
			const title = toolTitle(name, variant);
			const shownSummary = variant === "others" && title === "Tool call" && summary !== "" ? `${name} · ${summary}` : summary;
			const styles = officialFlowStyles.tool();
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: classes(styles.root, "dsh-assistant-standard-tool"),
				"data-official-styles": styles.root !== void 0 || void 0,
				"data-variant": variant,
				"data-tool": name,
				"data-state": state,
				children: [state !== "ok" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: "dsh-assistant-visually-hidden",
					children: state === "running" ? "Running" : state === "stopped" ? "Stopped" : "Failed"
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.DisclosureRow, {
					rowClassName: classes(styles.row, "dsh-assistant-standard-flow-row"),
					leadingClassName: classes(styles.leading, "dsh-assistant-standard-flow-leading"),
					titleClassName: classes(styles.title, "dsh-assistant-standard-flow-title"),
					chevronClassName: classes(styles.chevron, "dsh-assistant-standard-flow-chevron"),
					icon,
					title,
					open: expanded && expandable,
					expandable,
					expandOnRowClick: true,
					keepContentWhenOpen: true,
					onToggle: () => {
						if (expandable) setExpanded((value) => !value);
					},
					collapsedContent: shownSummary !== "" ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: classes(styles.sep, "dsh-assistant-standard-flow-separator"),
						"aria-hidden": true
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: classes(styles.summary, state === "error" && styles.errorSummary, "dsh-assistant-standard-flow-summary"),
						children: shownSummary
					})] }) : void 0,
					children: expandable && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: classes(styles.ioCard, "dsh-assistant-standard-tool-io"),
						children: [
							input !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ToolIo, {
								label: "IN",
								children: input
							}),
							input !== void 0 && output !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { className: classes(styles.ioDivider, "dsh-assistant-standard-tool-divider") }),
							output !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ToolIo, {
								label: "OUT",
								error: state === "error",
								children: output
							})
						]
					})
				})]
			});
		}
		function StandardUserMessage({ text, images, actions }) {
			const styles = officialFlowStyles.messageItem();
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: classes(styles.userRow, "dsh-assistant-user-row"),
				"data-official-styles": styles.userRow !== void 0 || void 0,
				"data-time-hover-root": true,
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: classes(styles.userStack, "dsh-assistant-user-stack"),
					children: [
						images,
						text !== "" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: classes(styles.bubble, "dsh-assistant-user-bubble"),
							children: text
						}),
						actions
					]
				})
			});
		}
		function StandardErrorRow({ text, locale = "zh" }) {
			const styles = officialFlowStyles.messageItem();
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: classes(styles.turnErrorRow, "dsh-assistant-error"),
				"data-official-styles": styles.turnErrorRow !== void 0 || void 0,
				role: "status",
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.StateDot, {
					state: "error",
					className: styles.turnErrorDot
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: styles.turnErrorCopy,
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: styles.turnErrorTitle,
						children: locale.toLocaleLowerCase().startsWith("zh") ? "本轮运行失败" : "This turn failed"
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: styles.turnErrorMessage,
						children: text
					})]
				})]
			});
		}
		function StandardFlowColumn({ children }) {
			const styles = officialFlowStyles.chatView();
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: classes(styles.column, "dsh-assistant-column"),
				"data-official-styles": styles.column !== void 0 || void 0,
				children
			});
		}
		function StandardFlowItem({ children }) {
			const styles = officialFlowStyles.chatView();
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: classes(styles.flowItem, "dsh-assistant-flow-item"),
				children
			});
		}
		function StandardActivityIndicator({ startTime, locale = "zh" }) {
			const [mountedAt] = (0, react.useState)(() => Date.now());
			const anchor = startTime ?? mountedAt;
			const [elapsedMs, setElapsedMs] = (0, react.useState)(() => Math.max(0, Date.now() - anchor));
			const styles = officialFlowStyles.chatView();
			(0, react.useEffect)(() => {
				const tick = () => {
					setElapsedMs(Math.max(0, Date.now() - anchor));
				};
				tick();
				const id = setInterval(tick, 1e3);
				return () => {
					clearInterval(id);
				};
			}, [anchor]);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: classes(styles.turnStatus, "dsh-assistant-standard-activity"),
				"data-official-styles": styles.turnStatus !== void 0 || void 0,
				role: "status",
				"aria-live": "polite",
				children: ["Deep diving...", elapsedMs >= 15e3 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: classes(styles.turnStatusClock, "dsh-assistant-standard-activity-clock"),
					"aria-hidden": true,
					children: formatRunDuration(elapsedMs, locale)
				})]
			});
		}
		function ToolIo({ label, error = false, children }) {
			const styles = officialFlowStyles.tool();
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: classes(styles.ioSection, "dsh-assistant-standard-tool-io-section"),
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: classes(styles.ioLabel, "dsh-assistant-standard-tool-io-label"),
					children: label
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: classes(styles.ioText, "dsh-assistant-standard-tool-io-text"),
					"data-error": error || void 0,
					children
				})]
			});
		}
		function toolIcon(name, state) {
			if (state === "error") return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.StateDot, { state: "error" });
			if (state === "stopped") return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.StateDot, { state: "warning" });
			const variant = toolVariant(name);
			if (variant === "search") return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconSearchOutline16, { size: 14 });
			if (variant === "read") return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconBrowseOutline16, { size: 14 });
			if (variant === "bash") return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconApiOutline14, { size: 14 });
			if (variant === "write" || variant === "edit") return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconEditOutline16, { size: 14 });
			if (variant === "code") return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconCodeOutline16, { size: 14 });
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconSparkle16, { size: 14 });
		}
		function toolVariant(name) {
			return TOOL_VARIANTS[name] ?? "others";
		}
		function toolTitle(name, variant) {
			return TOOL_TITLES[name] ?? VARIANT_TITLES[variant];
		}
		const TOOL_VARIANTS = {
			bash: "bash",
			pwsh: "bash",
			read: "read",
			web_fetch: "read",
			web_search: "search",
			grep: "search",
			glob: "search",
			write: "write",
			edit: "edit",
			run_code: "code",
			cordis_package_inspect: "read",
			cordis_runtime_inspect: "read",
			cordis_run: "others",
			cordis_stop: "others",
			cordis_undefine: "others"
		};
		const VARIANT_TITLES = {
			search: "Search",
			read: "Read",
			bash: "Bash",
			write: "Write",
			edit: "Edit",
			code: "Code",
			others: "Tool call"
		};
		const TOOL_TITLES = {
			cordis_package_inspect: "Inspect",
			cordis_runtime_inspect: "Inspect",
			cordis_run: "Run Cordis Plugin",
			cordis_stop: "Stop Cordis Plugin",
			cordis_undefine: "Remove Cordis Plugin",
			pwsh: "Pwsh"
		};
		function formatRunDuration(ms, locale) {
			const total = Math.max(0, Math.floor(ms / 1e3));
			const minutes = Math.floor(total / 60);
			const seconds = total % 60;
			if (locale.toLocaleLowerCase().startsWith("zh")) return minutes > 0 ? String(minutes) + "分" + String(seconds).padStart(2, "0") + "秒" : String(seconds) + "秒";
			return minutes > 0 ? String(minutes) + "m " + String(seconds).padStart(2, "0") + "s" : String(seconds) + "s";
		}
		function firstLine(text) {
			const newline = text.indexOf("\n");
			return newline === -1 ? text : text.slice(0, newline);
		}
		function latestLine(text) {
			const visible = text.trimEnd();
			const newline = visible.lastIndexOf("\n");
			return newline === -1 ? visible : visible.slice(newline + 1);
		}
		function useThrottledVisualUpdate(update, intervalFrames = 3) {
			const updateRef = (0, react.useRef)(update);
			updateRef.current = update;
			const pendingFrameRef = (0, react.useRef)(null);
			useBrowserLayoutEffect(() => () => {
				if (pendingFrameRef.current === null) return;
				cancelAnimationFrame(pendingFrameRef.current);
				pendingFrameRef.current = null;
			}, []);
			return (0, react.useCallback)(() => {
				if (pendingFrameRef.current !== null) return;
				let remainingFrames = intervalFrames;
				const advance = () => {
					remainingFrames -= 1;
					if (remainingFrames > 0) {
						pendingFrameRef.current = requestAnimationFrame(advance);
						return;
					}
					pendingFrameRef.current = null;
					updateRef.current();
				};
				pendingFrameRef.current = requestAnimationFrame(advance);
			}, [intervalFrames]);
		}
		const useBrowserLayoutEffect = typeof window === "undefined" ? react.useEffect : react.useLayoutEffect;
		const CODE_LABELS = {
			copyLabel: "Copy",
			copiedLabel: "Copied"
		};
		//#endregion
		//#region src/client/ContextMeter.tsx
		/** Composer context meter: pixel-matched to ui-conversation ContextMeter. */
		const RADIUS = 5.5;
		const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
		const ROWS = [
			{
				key: "system",
				label: "System prompt",
				tint: cls.cmSystem
			},
			{
				key: "tools",
				label: "Tools",
				tint: cls.cmTools
			},
			{
				key: "messages",
				label: "Messages",
				tint: cls.cmMessages
			}
		];
		function AssistantContextMeter({ context }) {
			const [open, setOpen] = (0, react.useState)(false);
			const rootRef = (0, react.useRef)(null);
			const percent = Math.min(100, Math.round(context.used / Math.max(context.cap, 1) * 100));
			const reading = String(percent) + "%";
			const aria = reading + " of context used";
			const total = context.system + context.tools + context.messages;
			const parts = total === 0 ? [{
				key: "total",
				tint: void 0,
				width: percent
			}] : ROWS.map((row) => ({
				key: row.key,
				tint: row.tint,
				width: percent * context[row.key] / total
			})).filter((part) => part.width > 0);
			(0, react.useEffect)(() => {
				if (!open) return;
				const onPointerDown = (event) => {
					if (event.target instanceof Node && rootRef.current?.contains(event.target) === true) return;
					setOpen(false);
				};
				const onKeyDown = (event) => {
					if (event.key === "Escape") setOpen(false);
				};
				document.addEventListener("pointerdown", onPointerDown);
				document.addEventListener("keydown", onKeyDown);
				return () => {
					document.removeEventListener("pointerdown", onPointerDown);
					document.removeEventListener("keydown", onKeyDown);
				};
			}, [open]);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
				ref: rootRef,
				className: cls.cmRoot,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Tooltip, {
					label: aria,
					side: "top",
					delayMs: 200,
					disabled: open,
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						className: cls.cmTrigger,
						"aria-label": aria,
						"aria-haspopup": "dialog",
						"aria-expanded": open,
						onClick: () => {
							setOpen((value) => !value);
						},
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("svg", {
							viewBox: "0 0 14 14",
							width: "14",
							height: "14",
							"aria-hidden": "true",
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("circle", {
								className: cls.cmTrack,
								cx: "7",
								cy: "7",
								r: RADIUS
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("circle", {
								className: cls.cmFill,
								cx: "7",
								cy: "7",
								r: RADIUS,
								strokeDasharray: String(CIRCUMFERENCE * percent / 100) + " " + String(CIRCUMFERENCE),
								transform: "rotate(-90 7 7)"
							})]
						})
					})
				}), open && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: cls.cmPanel,
					role: "dialog",
					"aria-label": "Context used",
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: cls.cmHeader,
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: cls.cmPercent,
									children: reading
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: cls.cmHeadline,
									children: "of context used"
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: cls.cmFigures,
									children: "~" + formatTokens(context.used) + " / " + formatTokens(context.cap)
								})
							]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: cls.cmBar,
							children: parts.map((part) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: part.tint === void 0 ? cls.cmSegment : cls.cmSegment + " " + part.tint,
								style: { width: String(part.width) + "%" }
							}, part.key))
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dl", {
							className: cls.cmRows,
							children: ROWS.map((row) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: cls.cmRow,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("dt", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: cls.cmSwatch + " " + row.tint,
									"aria-hidden": "true"
								}), row.label] }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("dd", { children: "~" + formatTokens(context[row.key]) })]
							}, row.key))
						})
					]
				})]
			});
		}
		function formatTokens(n) {
			const scaled = (v) => v >= 100 ? String(Math.round(v)) : String(Math.round(v * 10) / 10);
			if (n < 1e3) return String(n);
			if (n < 1e6) return scaled(n / 1e3) + "K";
			return scaled(n / 1e6) + "M";
		}
		//#endregion
		//#region src/client/ModelSelect.tsx
		/** Two-level Model / Effort menu, pixel-matched to ui-model-selection ModelSelect. */
		function AssistantModelSelect({ model, onSelect }) {
			const [open, setOpen] = (0, react.useState)(false);
			const [pane, setPane] = (0, react.useState)("root");
			const rootRef = (0, react.useRef)(null);
			const groups = model?.groups ?? [];
			const flat = model?.options ?? groups.flatMap((group) => group.models);
			const current = flat.find((entry) => entry.id === model?.model && (model.provider === void 0 || entry.provider === model.provider)) ?? flat.find((entry) => entry.id === model?.model);
			const modelLabel = current?.label ?? model?.model ?? "Model";
			const efforts = current?.efforts ?? model?.efforts ?? [];
			const effortLabel = model?.effortLabel ?? efforts.find((item) => item.id === model?.effort)?.name ?? model?.effort;
			(0, react.useEffect)(() => {
				if (!open) return;
				const onPointerDown = (event) => {
					if (event.target instanceof Node && rootRef.current?.contains(event.target) === true) return;
					setOpen(false);
					setPane("root");
				};
				const onKeyDown = (event) => {
					if (event.key !== "Escape") return;
					if (pane !== "root") setPane("root");
					else {
						setOpen(false);
						setPane("root");
					}
				};
				document.addEventListener("pointerdown", onPointerDown);
				document.addEventListener("keydown", onKeyDown);
				return () => {
					document.removeEventListener("pointerdown", onPointerDown);
					document.removeEventListener("keydown", onKeyDown);
				};
			}, [open, pane]);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				ref: rootRef,
				className: cls.msRoot,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
					type: "button",
					className: cls.msTrigger,
					"aria-haspopup": "menu",
					"aria-expanded": open,
					onClick: () => {
						if (open) {
							setOpen(false);
							setPane("root");
						} else {
							setOpen(true);
							setPane("root");
						}
					},
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: cls.msTriggerLabel,
							children: modelLabel
						}),
						effortLabel !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: cls.msTriggerEffort,
							children: effortLabel
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("svg", {
							className: open ? cls.msChevron + " " + cls.msChevronOpen : cls.msChevron,
							width: "12",
							height: "12",
							viewBox: "0 0 12 12",
							fill: "none",
							"aria-hidden": "true",
							children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
								d: "M3 4.5L6 7.5L9 4.5",
								stroke: "currentColor",
								strokeWidth: "1.5",
								strokeLinecap: "round",
								strokeLinejoin: "round"
							})
						})
					]
				}), open && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: cls.msMenu,
					role: "menu",
					children: [
						pane === "root" && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
							type: "button",
							role: "menuitem",
							className: cls.msCell,
							onClick: () => {
								setPane("model");
							},
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: cls.msCellLabel,
									children: "Model"
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: cls.msCellValue,
									children: modelLabel
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: cls.msCellChevron,
									children: "›"
								})
							]
						}), efforts.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
							type: "button",
							role: "menuitem",
							className: cls.msCell,
							onClick: () => {
								setPane("effort");
							},
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: cls.msCellLabel,
									children: "Effort"
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: cls.msCellValue,
									children: effortLabel ?? "Default"
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: cls.msCellChevron,
									children: "›"
								})
							]
						})] }),
						pane === "model" && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: cls.msGroups,
							children: [groups.length === 0 && flat.length === 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: cls.msStatus,
								children: "No models"
							}), groups.length > 0 ? groups.map((group) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: cls.msGroupTitle,
								children: group.name
							}), group.models.map((option) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ModelRow, {
								option,
								selected: option.id === model?.model && option.provider === model.provider,
								onPick: () => {
									onSelect(option.id, void 0, option.provider);
									setOpen(false);
									setPane("root");
								}
							}, group.id + ":" + option.id))] }, group.id)) : flat.map((option) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ModelRow, {
								option,
								selected: option.id === model?.model,
								onPick: () => {
									onSelect(option.id, void 0, option.provider);
									setOpen(false);
									setPane("root");
								}
							}, option.provider + ":" + option.id))]
						}),
						pane === "effort" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: cls.msGroups,
							children: efforts.map((effort) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
								type: "button",
								role: "menuitemradio",
								"aria-checked": effort.id === model?.effort,
								className: effort.id === model?.effort ? cls.msOption + " " + cls.msSelected : cls.msOption,
								onClick: () => {
									if (model !== void 0) onSelect(model.model, effort.id, model.provider);
									setOpen(false);
									setPane("root");
								},
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: cls.msOptionCopy,
									children: effort.name
								}), effort.id === model?.effort && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: cls.msCheck,
									children: "✓"
								})]
							}, effort.id))
						})
					]
				})]
			});
		}
		function ModelRow({ option, selected, onPick }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
				type: "button",
				role: "menuitemradio",
				"aria-checked": selected,
				className: selected ? cls.msOption + " " + cls.msSelected : cls.msOption,
				onClick: onPick,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: cls.msOptionCopy,
					children: option.label
				}), selected && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: cls.msCheck,
					children: "✓"
				})]
			});
		}
		//#endregion
		//#region src/client/session-list.ts
		function selectSessionList(useSessions) {
			return useSessions((state) => state);
		}
		//#endregion
		//#region src/client/AssistantSeat.tsx
		/** 席位：缩小版主聊天窗口。权限固定，不含 PermissionSelect。 */
		function AssistantSeat({ controller, locale, useSessions }) {
			const [open, setOpen] = (0, react.useState)(false);
			const [lastSeenSeq, setLastSeenSeq] = (0, react.useState)(null);
			const [draft, setDraft] = (0, react.useState)("");
			const [images, setImages] = (0, react.useState)([]);
			const [size, setSize] = (0, react.useState)({
				width: 368,
				height: 483
			});
			const [preview, setPreview] = (0, react.useState)(null);
			const [sendError, setSendError] = (0, react.useState)(null);
			const [rolloverBusy, setRolloverBusy] = (0, react.useState)(false);
			const [maximized, setMaximized] = (0, react.useState)(false);
			const [feedbackByKey, setFeedbackByKey] = (0, react.useState)({});
			const [anchorBottom, setAnchorBottom] = (0, react.useState)(PET_DEFAULT_BOTTOM);
			const bodyRef = (0, react.useRef)(null);
			const followOutputRef = (0, react.useRef)(true);
			const fileRef = (0, react.useRef)(null);
			const inputRef = (0, react.useRef)(null);
			const dragRef = (0, react.useRef)(null);
			const snapshot = (0, react.useSyncExternalStore)(controller.subscribe, controller.getSnapshot);
			const localeSnapshot = (0, react.useSyncExternalStore)((listener) => locale.subscribe(listener), () => locale.getSnapshot());
			const sessionList = selectSessionList(useSessions);
			const currentEntry = sessionList.current === void 0 ? void 0 : sessionList.byId[sessionList.current];
			const currentTask = currentEntry === void 0 || currentEntry.origin === "subagent" || currentEntry.blank ? void 0 : {
				sessionId: currentEntry.id,
				label: currentEntry.displayTitle
			};
			(0, react.useEffect)(() => {
				let cardObserver;
				let phaseObserver;
				let observedCard;
				let observedRoot;
				const measure = () => {
					const card = document.querySelector("[data-composer-card]");
					if (!(card instanceof HTMLElement)) {
						setAnchorBottom(PET_DEFAULT_BOTTOM);
						return;
					}
					setAnchorBottom(measurePetBottom(card));
				};
				const bind = () => {
					const card = document.querySelector("[data-composer-card]");
					if (!(card instanceof HTMLElement)) {
						if (observedCard !== void 0) {
							cardObserver?.disconnect();
							phaseObserver?.disconnect();
							observedCard = void 0;
							observedRoot = void 0;
							setAnchorBottom(PET_DEFAULT_BOTTOM);
						}
						return;
					}
					if (observedCard !== card) {
						cardObserver?.disconnect();
						cardObserver = new ResizeObserver(measure);
						cardObserver.observe(card);
						observedCard = card;
					}
					const root = card.closest("[data-phase]");
					if (root !== observedRoot) {
						phaseObserver?.disconnect();
						phaseObserver = void 0;
						observedRoot = root ?? void 0;
						if (root !== null) {
							phaseObserver = new MutationObserver(measure);
							phaseObserver.observe(root, {
								attributes: true,
								attributeFilter: ["data-phase"]
							});
						}
					}
					measure();
				};
				bind();
				const retry = setInterval(bind, 400);
				window.addEventListener("resize", measure);
				return () => {
					cardObserver?.disconnect();
					phaseObserver?.disconnect();
					clearInterval(retry);
					window.removeEventListener("resize", measure);
				};
			}, []);
			(0, react.useEffect)(() => {
				controller.watch();
				return () => {
					controller.unwatch();
				};
			}, [controller]);
			(0, react.useEffect)(() => {
				if (!open) {
					controller.close();
					return;
				}
				controller.open();
			}, [open, controller]);
			(0, react.useEffect)(() => {
				const id = snapshot?.sessionId;
				const seq = snapshot?.seq;
				if (id === void 0 || seq === void 0) return;
				if (open) {
					setLastSeenSeq(seq);
					writeLastSeenSeq(id, seq);
					return;
				}
				setLastSeenSeq(readLastSeenSeq(id));
			}, [
				snapshot?.sessionId,
				snapshot?.seq,
				open
			]);
			const items = snapshot?.items ?? messagesAsItems(snapshot?.messages ?? []);
			const pending = snapshot?.pending;
			const thinking = snapshot?.thinking;
			const busy = snapshot?.status === "running";
			const todos = snapshot?.todos ?? [];
			const goal = snapshot?.goal;
			const model = snapshot?.model;
			const context = snapshot?.context ?? {
				used: 1,
				cap: 128e3,
				system: 0,
				tools: 0,
				messages: 1
			};
			const contextSaturated = context.cap > 0 && context.used / context.cap >= .85;
			(0, react.useLayoutEffect)(() => {
				if (!open || !followOutputRef.current) return;
				const frame = requestAnimationFrame(() => {
					const body = bodyRef.current;
					if (body !== null) body.scrollTop = body.scrollHeight;
				});
				return () => {
					cancelAnimationFrame(frame);
				};
			}, [
				open,
				items.length,
				pending,
				thinking,
				busy
			]);
			(0, react.useEffect)(() => {
				const el = inputRef.current;
				if (el === null) return;
				el.style.height = "0px";
				const next = Math.min(Math.max(el.scrollHeight, 21), 126);
				el.style.height = `${next}px`;
				el.style.overflowY = el.scrollHeight > 126 ? "auto" : "hidden";
			}, [draft, open]);
			const send = () => {
				const text = draft.trim();
				if (text.length === 0 && images.length === 0) return;
				followOutputRef.current = true;
				const payload = images.map((image) => ({
					name: image.name,
					mediaType: image.mediaType,
					dataBase64: image.dataBase64
				}));
				setSendError(null);
				controller.send(text.length === 0 && payload.length > 0 ? " " : text, payload, currentTask).then((ok) => {
					if (!ok) {
						setSendError("发送失败，请重试");
						return;
					}
					setDraft("");
					for (const image of images) URL.revokeObjectURL(image.previewUrl);
					setImages([]);
				});
			};
			const addDraftImages = (files) => {
				const imagesOnly = files.filter(isImageFile);
				if (imagesOnly.length === 0) return;
				Promise.all(imagesOnly.map(readDraftImage)).then((next) => {
					setImages((current) => [...current, ...next]);
				});
			};
			const onFiles = (list) => {
				if (list === null) return;
				addDraftImages(Array.from(list));
			};
			const onPaste = (event) => {
				const fromItems = Array.from(event.clipboardData.items).filter((item) => item.kind === "file").map((item) => item.getAsFile()).filter((file) => file !== null);
				const files = fromItems.length > 0 ? fromItems : Array.from(event.clipboardData.files);
				if (!files.some(isImageFile)) return;
				event.preventDefault();
				addDraftImages(files);
			};
			const empty = items.length === 0 && (pending === void 0 || pending.length === 0);
			const canSend = draft.trim().length > 0 || images.length > 0;
			const lastAssistantSeq = [...items].reverse().find((item) => item.kind === "assistant")?.seq;
			const feedbackFor = (sessionId, seq) => {
				if (sessionId === void 0) return void 0;
				return feedbackByKey[sessionId + "." + String(seq)] ?? readMessageFeedback(sessionId, seq);
			};
			const setMessageFeedback = (sessionId, seq, next) => {
				if (sessionId === void 0) return;
				const key = sessionId + "." + String(seq);
				const resolved = feedbackFor(sessionId, seq) === next ? void 0 : next;
				writeMessageFeedback(sessionId, seq, resolved);
				setFeedbackByKey((current) => {
					const copy = { ...current };
					if (resolved === void 0) delete copy[key];
					else copy[key] = resolved;
					return copy;
				});
			};
			const onResizeStart = (event) => {
				event.preventDefault();
				event.stopPropagation();
				dragRef.current = {
					startX: event.clientX,
					startY: event.clientY,
					width: size.width,
					height: size.height
				};
				event.currentTarget.setPointerCapture(event.pointerId);
			};
			const onResizeMove = (event) => {
				const drag = dragRef.current;
				if (drag === null) return;
				const nextWidth = Math.min(Math.max(drag.width + (drag.startX - event.clientX), 300), window.innerWidth - 24);
				const nextHeight = Math.min(Math.max(drag.height + (drag.startY - event.clientY), 322), window.innerHeight - 16);
				setSize({
					width: nextWidth,
					height: nextHeight
				});
			};
			const onResizeEnd = () => {
				dragRef.current = null;
			};
			(0, react.useEffect)(() => {
				const onKey = (event) => {
					if (event.key !== "Escape") return;
					if (preview !== null) {
						setPreview(null);
						return;
					}
					if (maximized) setMaximized(false);
				};
				document.addEventListener("keydown", onKey);
				return () => {
					document.removeEventListener("keydown", onKey);
				};
			}, [preview, maximized]);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: cls.root,
				children: [
					open && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: cls.panel,
						role: "dialog",
						"aria-label": "DeepSeek 小管家",
						"data-maximized": maximized || void 0,
						style: maximized ? void 0 : {
							width: size.width,
							height: size.height,
							bottom: anchorBottom
						},
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: cls.resize,
								onPointerDown: onResizeStart,
								onPointerMove: onResizeMove,
								onPointerUp: onResizeEnd,
								onPointerCancel: onResizeEnd
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: cls.panelHead,
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: cls.panelTitle,
										children: "DeepSeek 小管家"
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										type: "button",
										className: cls.newConversation,
										"data-warning": contextSaturated ? "true" : void 0,
										disabled: busy || rolloverBusy,
										title: busy ? "小管家回复完再新开" : contextSaturated ? "上下文将满，新开一条继续" : "用短交接开启一条新的助理对话",
										"aria-label": contextSaturated ? "上下文将满，新开一条继续" : "新对话",
										onClick: () => {
											setRolloverBusy(true);
											setSendError(null);
											controller.newConversation().then((error) => {
												if (error !== void 0) setSendError(error);
											}).finally(() => {
												setRolloverBusy(false);
											});
										},
										children: rolloverBusy ? "切换中" : "新对话"
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										type: "button",
										className: cls.iconBtn,
										"aria-label": maximized ? "还原窗口" : "最大化",
										"aria-pressed": maximized,
										title: maximized ? "还原窗口" : "最大化",
										onClick: () => {
											setMaximized((value) => !value);
										},
										children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconFullscreenOutline16, { size: 14 })
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										type: "button",
										className: cls.iconBtn,
										"aria-label": "收起",
										title: "收起",
										onClick: () => {
											setOpen(false);
										},
										children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconCloseOutline16, { size: 14 })
									})
								]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: cls.panelBody,
								ref: bodyRef,
								onScroll: (event) => {
									const body = event.currentTarget;
									followOutputRef.current = body.scrollHeight - body.scrollTop - body.clientHeight <= 25;
								},
								children: empty ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
									className: cls.empty,
									children: "小管家还没说过话。发一条消息开始吧。"
								}) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(StandardFlowColumn, { children: [
									items.map((item) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(StandardFlowItem, { children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(TimelineRow, {
										item,
										controller,
										locale: localeSnapshot.active,
										lastAssistantSeq,
										busy: busy || rolloverBusy,
										feedback: feedbackFor(snapshot?.sessionId, item.seq),
										onFeedback: (next) => {
											setMessageFeedback(snapshot?.sessionId, item.seq, next);
										},
										onBranch: () => {
											setRolloverBusy(true);
											setSendError(null);
											controller.newConversation().then((error) => {
												if (error !== void 0) setSendError(error);
											}).finally(() => {
												setRolloverBusy(false);
											});
										},
										onOpenImage: (url, alt) => {
											setPreview({
												id: url,
												name: alt,
												mediaType: "image/png",
												dataBase64: "",
												previewUrl: url
											});
										}
									}) }, item.kind + String(item.seq))),
									thinking !== void 0 && thinking.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(StandardFlowItem, { children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(StandardReasoningRow, {
										text: thinking,
										running: true
									}) }),
									pending !== void 0 && pending.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(StandardFlowItem, { children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(StandardAssistantMessage, {
										text: pending,
										streaming: true
									}) }),
									busy && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(StandardActivityIndicator, {
										startTime: snapshot?.turnStartTime,
										locale: localeSnapshot.active
									})
								] })
							}),
							(todos.length > 0 || goal !== void 0) && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: cls.dock,
								children: [
									goal !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: cls.dockTitle,
										children: ["Goal · ", goal.status]
									}),
									goal !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
										className: cls.dockItem,
										children: goal.title
									}),
									todos.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
										className: cls.dockTitle,
										children: "任务"
									}),
									todos.map((todo) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
										className: cls.dockItem,
										"data-status": todo.status,
										children: todo.content
									}, todo.id))
								]
							}),
							sendError !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: cls.empty,
								style: {
									padding: "4px 12px 0",
									margin: 0
								},
								children: sendError
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("form", {
								className: cls.composer,
								onSubmit: (event) => {
									event.preventDefault();
									send();
								},
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: cls.card,
									children: [
										images.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
											className: cls.rail,
											children: images.map((image) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
												className: cls.thumb,
												children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("img", {
													src: image.previewUrl,
													alt: image.name,
													onClick: () => {
														setPreview(image);
													}
												}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
													type: "button",
													className: cls.thumbRemove,
													"aria-label": "移除图片",
													onClick: (event) => {
														event.stopPropagation();
														if (preview?.id === image.id) setPreview(null);
														URL.revokeObjectURL(image.previewUrl);
														setImages((current) => current.filter((entry) => entry.id !== image.id));
													},
													children: "×"
												})]
											}, image.id))
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
											className: cls.inputWrap,
											children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("textarea", {
												ref: inputRef,
												className: cls.textarea,
												value: draft,
												rows: 1,
												placeholder: "跟小管家说点什么…",
												"aria-label": "消息输入",
												onChange: (event) => {
													setDraft(event.currentTarget.value);
												},
												onPaste,
												onKeyDown: (event) => {
													if (event.key === "Enter" && !event.shiftKey) {
														event.preventDefault();
														send();
													}
												}
											})
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
											className: cls.row,
											children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
												className: cls.tools,
												children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
													ref: fileRef,
													type: "file",
													accept: "image/*",
													multiple: true,
													hidden: true,
													onChange: (event) => {
														onFiles(event.currentTarget.files);
														event.currentTarget.value = "";
													}
												}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
													type: "button",
													className: cls.add,
													"aria-label": "添加图片",
													onClick: () => {
														fileRef.current?.click();
													},
													children: "+"
												})]
											}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
												className: cls.trailing,
												children: [
													/* @__PURE__ */ (0, react_jsx_runtime.jsx)(AssistantModelSelect, {
														model,
														onSelect: (modelId, effort, provider) => {
															controller.setModel(modelId, effort, provider).then((error) => {
																if (error !== void 0) setSendError(error);
																else setSendError(null);
															});
														}
													}),
													/* @__PURE__ */ (0, react_jsx_runtime.jsx)(AssistantContextMeter, { context }),
													/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
														type: "submit",
														className: cls.send,
														disabled: !canSend,
														"aria-label": "发送",
														children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("svg", {
															viewBox: "0 0 16 16",
															width: "14",
															height: "14",
															fill: "none",
															"aria-hidden": "true",
															children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
																d: "M8 13V3M4 7l4-4 4 4",
																stroke: "currentColor",
																strokeWidth: "1.6",
																strokeLinecap: "round",
																strokeLinejoin: "round"
															})
														})
													})
												]
											})]
										})
									]
								})
							})
						]
					}),
					!(open && maximized) && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: !open && lastSeenSeq !== null && (snapshot?.seq ?? 0) > lastSeenSeq ? `${cls.pet} ${cls.petUnread}` : cls.pet,
						style: { bottom: anchorBottom },
						role: "button",
						tabIndex: 0,
						"aria-label": open ? "收起助理" : "展开助理",
						"aria-expanded": open,
						onClick: () => {
							setOpen((value) => {
								const next = !value;
								if (next) {
									followOutputRef.current = true;
									const seq = controller.getSnapshot()?.seq ?? 0;
									setLastSeenSeq(seq);
									const id = controller.getSnapshot()?.sessionId;
									if (id !== void 0) writeLastSeenSeq(id, seq);
								}
								return next;
							});
						},
						onKeyDown: (event) => {
							if (event.key !== "Enter" && event.key !== " ") return;
							event.preventDefault();
							setOpen((value) => {
								const next = !value;
								if (next) followOutputRef.current = true;
								return next;
							});
						},
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(WhaleMark, { className: cls.petIcon })
					}),
					preview !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: cls.lightbox,
						role: "dialog",
						"aria-label": preview.name,
						onClick: () => {
							setPreview(null);
						},
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: cls.lightboxClose,
							"aria-label": "关闭",
							onClick: () => {
								setPreview(null);
							},
							children: "×"
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("img", {
							className: cls.lightboxImg,
							src: preview.previewUrl,
							alt: preview.name,
							onClick: (event) => {
								event.stopPropagation();
							}
						})]
					})
				]
			});
		}
		function TimelineRow({ item, controller, locale, lastAssistantSeq, busy, feedback, onFeedback, onBranch, onOpenImage }) {
			const zh = locale.toLocaleLowerCase().startsWith("zh");
			if (item.kind === "user") {
				const images = item.images !== void 0 && item.images.length > 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: cls.userImages,
					children: item.images.map((image) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ChatImage, {
						image,
						controller,
						onOpen: onOpenImage
					}, image.attachmentId))
				}) : void 0;
				return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(StandardUserMessage, {
					text: item.text,
					images,
					actions: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(MessageActions, {
						text: item.text,
						align: "end",
						zh
					})
				});
			}
			if (item.kind === "task-reference") {
				const omitted = item.receipt.omittedSessions > 0 ? " · 省略 " + String(item.receipt.omittedSessions) + " 条" : "";
				return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: cls.taskMarker,
					children: [
						"已引用任务 · ",
						item.receipt.label,
						" · ",
						String(item.receipt.sourceSessionIds.length),
						" 条来源",
						omitted
					]
				});
			}
			if (item.kind === "error") return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(StandardErrorRow, {
				text: item.text,
				locale
			});
			if (item.kind === "tool") return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(StandardToolRow, {
				name: item.name,
				summary: item.summary,
				status: item.status,
				input: item.input,
				output: item.output
			});
			const blocks = item.blocks ?? [{
				kind: "text",
				text: item.text
			}];
			const lastText = [...blocks].reverse().find((block) => block.kind === "text");
			const actions = lastText === void 0 ? void 0 : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(MessageActions, {
				text: item.text,
				align: "start",
				showFeedback: true,
				feedback,
				onFeedback,
				onBranch,
				branchDisabled: busy || lastAssistantSeq !== item.seq,
				zh
			});
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(StandardFlowBody, { children: blocks.map((block, index) => block.kind === "reasoning" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(StandardReasoningRow, {
				text: block.text,
				running: false
			}, index) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(StandardAssistantMessage, {
				text: block.text,
				actions: block === lastText ? actions : void 0
			}, index)) });
		}
		function messagesAsItems(messages) {
			return messages.map((message) => message.role === "user" ? {
				kind: "user",
				seq: message.seq,
				text: message.text,
				time: message.time,
				source: message.source
			} : {
				kind: "assistant",
				seq: message.seq,
				text: message.text,
				time: message.time
			});
		}
		function ChatImage({ image, controller, onOpen }) {
			const [url, setUrl] = (0, react.useState)(void 0);
			(0, react.useEffect)(() => {
				let revoked;
				controller.readImage(image.attachmentId).then((loaded) => {
					if (loaded === void 0) return;
					revoked = "data:" + loaded.mediaType + ";base64," + loaded.dataBase64;
					setUrl(revoked);
				});
				return () => {};
			}, [controller, image.attachmentId]);
			if (url === void 0) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { className: cls.thumb });
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("img", {
				src: url,
				alt: image.name ?? "image",
				onClick: () => {
					onOpen(url, image.name ?? "image");
				}
			});
		}
		const PET_DEFAULT_BOTTOM = 8;
		/** Align with the main composer only while it is docked. Hero / new-session
		*  centers the card mid-column; following that bottom would lift the whale. */
		function measurePetBottom(card) {
			if (card.closest("[data-phase]")?.getAttribute("data-phase") !== "active") return PET_DEFAULT_BOTTOM;
			return Math.max(0, Math.round(window.innerHeight - card.getBoundingClientRect().bottom));
		}
		function readLastSeenSeq(sessionId) {
			try {
				const raw = window.localStorage.getItem("dsh-llm-assistant.lastSeenSeq." + sessionId);
				if (raw === null) return null;
				const seq = Number(raw);
				return Number.isFinite(seq) ? seq : null;
			} catch {
				return null;
			}
		}
		function writeLastSeenSeq(sessionId, seq) {
			try {
				window.localStorage.setItem("dsh-llm-assistant.lastSeenSeq." + sessionId, String(seq));
			} catch {}
		}
		function isImageFile(file) {
			if (file.type.startsWith("image/")) return true;
			return /\.(png|jpe?g|webp|gif|bmp)$/i.test(file.name);
		}
		async function readDraftImage(file) {
			const previewUrl = URL.createObjectURL(file);
			const compressed = await compressImage(file);
			return {
				id: file.name + String(file.size) + String(file.lastModified),
				name: file.name,
				mediaType: compressed.mediaType,
				dataBase64: compressed.dataBase64,
				previewUrl
			};
		}
		async function compressImage(file) {
			try {
				const bitmap = await createImageBitmap(file);
				const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
				const canvas = document.createElement("canvas");
				canvas.width = Math.max(1, Math.round(bitmap.width * scale));
				canvas.height = Math.max(1, Math.round(bitmap.height * scale));
				const ctx = canvas.getContext("2d");
				if (ctx === null) return bytesToPayload(file, await file.arrayBuffer());
				ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
				const blob = await new Promise((resolve) => {
					canvas.toBlob(resolve, "image/jpeg", .82);
				});
				if (blob === null) return bytesToPayload(file, await file.arrayBuffer());
				return {
					mediaType: "image/jpeg",
					dataBase64: await blobToBase64(blob)
				};
			} catch {
				return bytesToPayload(file, await file.arrayBuffer());
			}
		}
		function bytesToPayload(file, buffer) {
			const bytes = new Uint8Array(buffer);
			let binary = "";
			for (const byte of bytes) binary += String.fromCharCode(byte);
			return {
				mediaType: file.type || "image/png",
				dataBase64: btoa(binary)
			};
		}
		async function blobToBase64(blob) {
			const buffer = await blob.arrayBuffer();
			const bytes = new Uint8Array(buffer);
			let binary = "";
			for (const byte of bytes) binary += String.fromCharCode(byte);
			return btoa(binary);
		}
		//#endregion
		//#region src/client/index.ts
		const name = "dsh-llm-assistant-client";
		const inject = [
			"slots",
			"layout",
			"connection",
			"locale"
		];
		function apply(ctx) {
			ensureAssistantStyles();
			const controller = new AssistantController(ctx);
			const locale = ctx.locale;
			ctx.slots.inject("shell.overlay", () => ctx.slots.register({
				name: "shell.overlay",
				id: "llm-assistant-seat",
				order: 60,
				inject: () => ({
					controller,
					locale
				})
			}, AssistantSeat));
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		exports.name = name;
		return module.exports;
	}
});
