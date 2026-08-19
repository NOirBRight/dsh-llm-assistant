/**
 * pet-probe —— 宠物 Agent 常驻假设的验证探针（仅用于 dsh-lab 的 pet-probe profile）。
 *
 * 已验证（第一轮）：
 *   Q1 不属于任何项目的会话能创建并常驻          ✅
 *   Q2 schedule 插件之后创建的 root Agent 拿得到 schedule_* 工具  ✅
 *   Q3 全程无浏览器连接时 dispatch 照常触发（误差 2ms）          ✅
 *   Q4 dispatch 真的开了一轮新 turn                              ✅
 *
 * 本轮补验证两个边界：
 *   Q5 浏览器连过再断开，宠物会话会不会被回收？
 *   Q6 dsh 进程重启后 resume 会话，错过的提醒会不会补投？
 *
 * 两阶段用状态文件串联：无状态文件 → create 模式（挂提醒后可随时杀进程）；
 * 有状态文件 → resume 模式（只观察补投，不挂新提醒）。
 */

import { randomUUID } from 'node:crypto'
import { appendFileSync, existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

// host 侧的包解析：link 安装的插件会带自己那份 nested 副本，
// 那份副本里的 SessionId / createUserMessage 与运行时不是同一个实现。
// 照 legacy-codex-connect-events.mjs 的先例，从运行中的 dsh entry 解析。
const entry = process.argv[1]
if (entry === undefined) throw new Error('pet-probe: process.argv[1] is missing')
const hostRequire = createRequire(realpathSync(entry))
const hostImport = async (id) => import(pathToFileURL(hostRequire.resolve(id)).href)

const { SessionId } = await hostImport('@deepseek-ai/dsh-session')
const { createUserMessage } = await hostImport('@deepseek-ai/dsh-llm')

const BASE = '/home/noirbright/Workstation/dsh-llm-assistant'
const LOG = `${BASE}/probe.log`
const STATE = `${BASE}/probe-state.json`
const PET_CWD = '/home/noirbright/.dsh-lab/pet-workspace'
/** 提醒延迟。after_seconds 没有 5 分钟下限（那是 every_seconds 的限制）。 */
const REMIND_AFTER_SECONDS = Number(process.env.PROBE_AFTER_SECONDS ?? 150)

function log(line) {
  const text = `[${new Date().toISOString()}] ${line}\n`
  appendFileSync(LOG, text)
  process.stderr.write(`pet-probe ${text}`)
}

/** 事件里可能藏着失败原因，截断后原样记录，不做解释。 */
function brief(value, max = 300) {
  try {
    const text = JSON.stringify(value)
    if (text === undefined) return String(value)
    return text.length > max ? `${text.slice(0, max)}…` : text
  } catch {
    return String(value)
  }
}

export const name = 'pet-probe'
export const inject = ['agentDefaultModel', 'agents', 'sessions', 'tools']

/** 装事件监听。必须在 create/resume 之前装好，否则漏掉头几条。 */
function watch(ctx, sessionId) {
  ctx.on('session/event', (session, event) => {
    if (session.id !== sessionId) return
    const type = event.type
    if (type === 'schedule/change') {
      log(`>>> schedule/change ${brief(event.data, 400)}`)
    } else if (type === 'turn/start' || type === 'turn/end') {
      log(`>>> ${type} seq=${event.seq} ${brief(event.data, 200)}`)
    } else if (type === 'user/message') {
      log(`>>> user/message source=${brief(event.data?.message?.source ?? event.data?.source)}`)
    } else if (type.startsWith('assistant/') && type !== 'assistant/chunk') {
      log(`>>> ${type} ${brief(event.data, 200)}`)
    } else if (type.includes('error') || type.includes('fail')) {
      log(`!!! ${type} ${brief(event.data, 400)}`)
    } else if (type === 'tool/call') {
      log(`>>> tool/call ${brief(event.data, 200)}`)
    }
  })
}

/** 心跳，观察窗口内每 20 秒报一次存活与进度。 */
function heartbeat(agent, phase) {
  const started = Date.now()
  const timer = setInterval(() => {
    const elapsed = Math.round((Date.now() - started) / 1000)
    log(`... [${phase}] 心跳 +${elapsed}s status=${agent.status} seq=${agent.session.seq}`)
    if (elapsed > 300) {
      clearInterval(timer)
      log(`=== [${phase}] 观察窗口结束 seq=${agent.session.seq} ===`)
    }
  }, 20_000)
}

async function run(ctx) {
  // 官方姿势：loader 的兄弟插件是并发挂载的，等整棵树 settle 之后再建 Agent，
  // 否则它的 scoped 工具与适配器可能只组装了一半 —— schedule 正是其中之一。
  await ctx.get('loader')?.await()

  const agents = ctx.get('agents')
  const defaultModel = ctx.get('agentDefaultModel')
  const sessions = ctx.get('sessions')
  if (agents === undefined || defaultModel === undefined || sessions === undefined) {
    log('FATAL 核心服务缺失，树可能正在拆除')
    return
  }

  mkdirSync(PET_CWD, { recursive: true })
  const selection = defaultModel.currentSelection()
  const agentOptions = { provider: selection.provider, model: selection.model }

  const resuming = existsSync(STATE)
  if (resuming) {
    // ---- Q6：进程重启后恢复同一个会话，看错过的提醒会不会补投 ----
    const saved = JSON.parse(readFileSync(STATE, 'utf8'))
    const sessionId = SessionId(saved.sessionId)
    log(`=== [RESUME] 阶段二启动 === 恢复会话 ${sessionId}`)
    log(`[RESUME] 该会话的提醒原定触发于 ${saved.scheduledAt}（现在 ${new Date().toISOString()}）`)

    watch(ctx, sessionId)
    let agent
    try {
      ;({ agent } = await agents.resume({ resumeSessionId: sessionId, agentOptions }))
    } catch (error) {
      log(`[RESUME] FAIL 恢复失败：${error instanceof Error ? error.message : String(error)}`)
      return
    }
    log(`Q6 会话已恢复 status=${agent.status} seq=${agent.session.seq}`)
    log('Q6 判据：若补投，应出现 schedule/change 的 dispatch + turn/start；若不补投，则一直静默')
    heartbeat(agent, 'RESUME')
    return
  }

  // ---- 阶段一：建会话、挂提醒、写状态文件，然后等人来杀进程 ----
  const sessionId = SessionId(`session-${randomUUID()}`)
  log(`=== [CREATE] 阶段一启动 === model=${selection.provider}/${selection.model}`)

  watch(ctx, sessionId)
  const { agent } = await agents.create({ sessionId, meta: { cwd: PET_CWD }, agentOptions })
  log(`[CREATE] 会话已建 id=${sessionId}`)

  await agent.whenIdle()
  agent.followup(createUserMessage({
    content: [{
      type: 'text',
      text: `请调用 schedule_create 工具，设置一个 ${REMIND_AFTER_SECONDS} 秒后触发的一次性提醒，`
        + `after_seconds 传 ${REMIND_AFTER_SECONDS}，prompt 传 "RESTART_PING"。只调这一个工具，不要做别的事。`,
    }],
    source: { kind: 'user' },
  }))
  await agent.whenIdle()
  await sessions.flush(agent.session)

  // 从日志里捞出刚创建的提醒的目标时刻，写进状态文件供阶段二核对。
  const created = [...agent.session.events]
    .reverse()
    .find(e => e.type === 'schedule/change' && e.data?.operation === 'create')
  const scheduledAt = created?.data?.schedule?.scheduledAt ?? 'unknown'
  writeFileSync(STATE, JSON.stringify({ sessionId, scheduledAt }, null, 2))
  log(`[CREATE] 提醒已挂，目标时刻 ${scheduledAt}，状态已写入 probe-state.json`)
  log('[CREATE] 现在可以杀进程了 —— 要在目标时刻之前杀掉，才能测出补投行为')
  heartbeat(agent, 'CREATE')
}

export function apply(ctx) {
  void run(ctx).catch((error) => {
    log(`FATAL ${error instanceof Error ? `${error.message}\n${error.stack}` : String(error)}`)
  })
}
