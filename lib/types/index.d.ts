/**
 * Host half: the resident assistant session.
 *
 * T1.1 — on boot, create or resume one root Agent session that belongs to no
 * workspace, and persist its id so a process restart resumes the same session
 * (history and reminders continue). The session's cwd is a dedicated directory
 * under $DSH_HOME, so it never appears in any project's session tree.
 *
 * T1.2 — expose the assistant to the seat panel over the Connection generic
 * RPC channel: snapshot (projected history + live status) and send (drive a
 * user message into the session). The client polls the snapshot while a turn
 * streams; the host projects from the session log, so a page refresh keeps the
 * history (AC-CHAT-5).
 *
 * SessionId / createUserMessage are resolved from the running dsh entry at
 * runtime (not this plugin's nested node_modules copy) — the same technique
 * probe.mjs uses. Both are compile-time brands/casts with no runtime cost, but
 * resolving them from the runtime keeps this bundle free of duplicate
 * dsh-session / dsh-llm module instances.
 */
import type { Context } from '@deepseek-ai/cordis';
/** Stable Cordis plugin name. */
export declare const name = "dsh-llm-assistant";
/**
 * Core services required before the assistant session can be created. cordis
 * only loads this plugin once every injected service is available, so create /
 * resume never races a half-composed tree. `tools` is included so the boot
 * diagnostic can assert the schedule tools are visible (AC-SESSION-2/7);
 * `connection` carries the seat RPC channel to the browser (T1.2). The loader
 * is awaited via ctx.get, not injected.
 */
export declare const inject: string[];
/** Mount the resident assistant session. */
export declare function apply(ctx: Context): void;
//# sourceMappingURL=index.d.ts.map