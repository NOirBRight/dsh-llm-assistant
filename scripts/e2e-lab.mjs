#!/usr/bin/env node

import { execFileSync, spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const base = new URL(process.env.E2E_URL ?? 'http://127.0.0.1:3082/')
if (base.hostname !== '127.0.0.1' || base.port !== '3082') {
  throw new Error('E2E_URL must be exactly the 3082 lab plane')
}
const chromeBin = process.env.CHROME_BIN ?? 'google-chrome'
const debugPort = Number(process.env.E2E_CDP_PORT ?? '9322')
const profile = mkdtempSync(join(tmpdir(), 'dsh-assistant-e2e-'))
let chrome
let cdp

const pass = (name) => console.log('PASS ' + name)
const assert = (condition, message) => {
  if (!condition) throw new Error(message)
}
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function waitFor(check, label, timeoutMs = 30_000, intervalMs = 250) {
  const deadline = Date.now() + timeoutMs
  let lastError
  while (Date.now() < deadline) {
    try {
      const value = await check()
      if (value) return value
    } catch (error) {
      lastError = error
    }
    await delay(intervalMs)
  }
  throw new Error('timed out waiting for ' + label + (lastError === undefined ? '' : ': ' + String(lastError)))
}

async function rpc(channel, method, payload = {}) {
  const rpcId = randomUUID()
  const response = await fetch(new URL(channel + '/' + method, base), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ type: 'client-request', rpcId, method, payload }),
  })
  assert(response.ok, 'HTTP ' + response.status + ' for ' + channel + '/' + method)
  const envelope = await response.json()
  assert(envelope.rpcId === rpcId, 'RPC correlation mismatch for ' + method)
  assert(envelope.result?.ok === true, 'RPC failed for ' + method + ': ' + JSON.stringify(envelope.result))
  return envelope.result.value
}

class Cdp {
  constructor(socket) {
    this.socket = socket
    this.nextId = 0
    this.pending = new Map()
    this.events = []
    socket.onmessage = (message) => {
      const value = JSON.parse(String(message.data))
      if (value.id !== undefined) {
        const pending = this.pending.get(value.id)
        this.pending.delete(value.id)
        if (value.error !== undefined) pending?.reject(new Error(JSON.stringify(value.error)))
        else pending?.resolve(value.result)
      } else {
        this.events.push(value)
      }
    }
  }

  call(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = ++this.nextId
      this.pending.set(id, { resolve, reject })
      this.socket.send(JSON.stringify({ id, method, params }))
    })
  }

  async evaluate(expression) {
    const result = await this.call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
    if (result.exceptionDetails !== undefined) throw new Error(result.exceptionDetails.text)
    return result.result.value
  }

  close() {
    this.socket.close()
  }
}

async function openBrowser() {
  try {
    const occupied = await fetch('http://127.0.0.1:' + String(debugPort) + '/json/version')
    if (occupied.ok) throw new Error('E2E_CDP_PORT is already in use: ' + String(debugPort))
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('E2E_CDP_PORT')) throw error
  }
  chrome = spawn(chromeBin, [
    '--headless=new',
    '--no-sandbox',
    '--ozone-platform=headless',
    '--disable-gpu',
    '--disable-extensions',
    '--no-first-run',
    '--no-default-browser-check',
    '--user-data-dir=' + profile,
    '--remote-debugging-port=' + String(debugPort),
    'about:blank',
  ], { stdio: ['ignore', 'ignore', 'pipe'] })
  let chromeStderr = ''
  chrome.stderr.on('data', (chunk) => { chromeStderr += String(chunk) })
  chrome.on('exit', (code) => {
    if (cdp === undefined && code !== null && code !== 0) console.error(chromeStderr)
  })
  const targets = await waitFor(async () => {
    const response = await fetch('http://127.0.0.1:' + String(debugPort) + '/json')
    if (!response.ok) return undefined
    const value = await response.json()
    return value.find((entry) => entry.type === 'page')
  }, 'Chrome DevTools target')
  const socket = new WebSocket(targets.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject })
  cdp = new Cdp(socket)
  await cdp.call('Page.enable')
  await cdp.call('Runtime.enable')
  await cdp.call('Log.enable')
  return cdp
}

async function waitForDom(expression, label, timeoutMs = 30_000) {
  return waitFor(() => cdp.evaluate(expression), label, timeoutMs)
}

async function navigate() {
  await cdp.call('Page.navigate', { url: base.href })
  await waitForDom("document.readyState === 'complete'", 'document load')
  await waitForDom("!!document.querySelector('[aria-label=\"展开助理\"], [aria-label=\"收起助理\"]')", 'assistant seat', 60_000)
}

async function browserScenario() {
  await navigate()
  const shell = await cdp.evaluate("JSON.stringify({ seat: document.querySelectorAll('.dsh-assistant-root').length, sideChat: document.body.innerText.includes('Side Chat') })")
  const shellState = JSON.parse(shell)
  assert(shellState.seat === 1, 'assistant seat must render exactly once')
  assert(shellState.sideChat === false, 'Side Chat must be absent from the shell')
  pass('seat visible and Side Chat absent')
  await cdp.evaluate("document.querySelector('[aria-label=\"Open sidebar\"]')?.click()")
  await waitForDom("!!document.querySelector('[aria-label^=\"Session actions for \u0022]')", 'existing main task row', 60_000)
  const selectedTask = await cdp.evaluate("(() => { const action = document.querySelector('[aria-label^=\"Session actions for \u0022]'); const label = action?.getAttribute('aria-label'); action?.parentElement?.click(); return label })()")
  assert(typeof selectedTask === 'string', 'an existing main task must be selected for current-page reference')
  await delay(1_000)
  await cdp.evaluate("document.querySelector('[aria-label=\"Collapse sidebar\"]')?.click()")
  pass('existing main task selected as current page')

  await cdp.evaluate("document.querySelector('[aria-label=\"展开助理\"]')?.click()")
  await waitForDom("!!document.querySelector('[aria-label=\"DeepSeek 小管家\"]')", 'assistant dialog')
  const chromeState = JSON.parse(await cdp.evaluate("JSON.stringify({ title: document.querySelector('[aria-label=\"DeepSeek 小管家\"]')?.textContent.includes('DeepSeek 小管家'), newConversation: !!document.querySelector('[aria-label=\"新对话\"]'), taskAction: Array.from(document.querySelectorAll('button')).some((node) => node.textContent?.trim() === '引用任务'), picker: !!document.querySelector('.dsh-assistant-task-picker'), chip: !!document.querySelector('.dsh-assistant-task-chip') })"))
  assert(chromeState.title && chromeState.newConversation, 'assistant chrome is incomplete')
  assert(!chromeState.taskAction && !chromeState.picker && !chromeState.chip, 'task reference must not be a visible user option')
  pass('dialog has no task reference controls')

  const before = await waitFor(async () => {
    const snapshot = await rpc('llm-assistant', 'assistant/snapshot')
    return snapshot.status === 'idle' && snapshot
  }, 'idle assistant before model turn', 180_000, 1_000)
  await cdp.evaluate("(() => { const probe = { samples: [], ongoing: false }; window.__assistantRenderProbe = probe; const capture = () => { probe.ongoing ||= document.querySelector('.dsh-assistant-standard-activity')?.textContent?.includes('Deep diving...') === true; const node = document.querySelector('.dsh-assistant-standard-message[data-streaming]'); if (!node) return; const length = node.textContent?.length ?? 0; if (length > 0 && probe.samples.at(-1)?.length !== length) probe.samples.push({ length, time: performance.now() }); }; const root = document.querySelector('.dsh-assistant-panel-body'); window.__assistantRenderObserver?.disconnect(); window.__assistantRenderObserver = new MutationObserver(capture); if (root) window.__assistantRenderObserver.observe(root, { childList: true, characterData: true, subtree: true, attributes: true }); capture(); })()")
  const nonce = 'E2E_TASK_' + Date.now().toString(36)
  const prompt = '请查看当前页面任务的上下文，用一句话概括这项任务正在做什么；不要猜测，如果当前助理对话里没有这些事实就自行获取。成功取得任务上下文后必须用 TASK_CONTEXT_OK: 开头；如果取不到，不要输出这个前缀。最后原样附上 ' + nonce
  await cdp.evaluate("(() => { const node = document.querySelector('[aria-label=\"消息输入\"]'); const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set; setter.call(node, " + JSON.stringify(prompt) + "); node.dispatchEvent(new Event('input', { bubbles: true })); return node.value })()")
  await waitForDom("!document.querySelector('[aria-label=\"发送\"]')?.disabled", 'enabled send button')
  await cdp.evaluate("document.querySelector('[aria-label=\"发送\"]')?.click()")

  const settled = await waitFor(async () => {
    const snapshot = await rpc('llm-assistant', 'assistant/snapshot')
    const answer = snapshot.items.filter((item) => item.kind === 'assistant' && item.seq > before.seq).at(-1)
    const tool = snapshot.items.find((item) => item.kind === 'tool' && item.seq > before.seq && item.name === 'task_reference' && item.status === 'done')
    return snapshot.status === 'idle' && tool !== undefined && answer?.text.includes('TASK_CONTEXT_OK:') && answer.text.includes(nonce) ? snapshot : undefined
  }, 'autonomous task_reference call and real model reply', 240_000, 1_000)
  const newItems = settled.items.filter((item) => item.seq > before.seq)
  const taskTool = newItems.find((item) => item.kind === 'tool' && item.name === 'task_reference')
  assert(taskTool?.status === 'done', 'task_reference tool must complete successfully')
  assert(newItems.filter((item) => item.kind === 'tool').every((item) => item.name === 'task_reference'), 'referenced turn must not fall back to unrelated tools')
  assert(newItems.filter((item) => item.kind === 'task-reference').length === 0, 'new tool flow must not append a legacy task marker')
  assert(newItems.filter((item) => item.kind === 'user' && item.source === 'session-reference').length === 0, 'raw reference must not render as a user bubble')
  await waitForDom("!!document.querySelector('.dsh-assistant-standard-tool[data-tool=\"task_reference\"][data-state=\"ok\"]')", 'standard task_reference tool row', 30_000)
  const renderParity = JSON.parse(await cdp.evaluate("JSON.stringify({ standardTool: !!document.querySelector('.dsh-assistant-standard-tool [data-disclosure-row]'), standardMarkdown: !!document.querySelector('.dsh-assistant-standard-message'), officialToolStyles: !!document.querySelector('.dsh-assistant-standard-tool[data-official-styles=true]'), officialMessageStyles: !!document.querySelector('.dsh-assistant-standard-message[data-official-styles=true]'), legacyMarkdown: !!document.querySelector('.dsh-assistant-markdown, .dsh-assistant-caret') })"))
  assert(renderParity.standardTool && renderParity.standardMarkdown, 'assistant must use standard main-chat tool and markdown renderers')
  assert(renderParity.officialToolStyles && renderParity.officialMessageStyles, 'assistant must reference DSH-owned renderer styles')
  assert(renderParity.legacyMarkdown === false, 'legacy assistant renderer must be absent')
  const motion = JSON.parse(await cdp.evaluate("(() => { window.__assistantRenderObserver?.disconnect(); const message = document.querySelector('.dsh-assistant-standard-message'); const prose = message?.querySelector('p') ?? message?.querySelector('.dsh-assistant-standard-message-body > div'); const style = prose ? getComputedStyle(prose) : null; return JSON.stringify({ samples: window.__assistantRenderProbe?.samples ?? [], ongoing: window.__assistantRenderProbe?.ongoing ?? false, fontSize: style?.fontSize ?? null, lineHeight: style?.lineHeight ?? null }); })()"))
  assert(motion.ongoing === true, 'main-window Deep diving turn status was not rendered')
  assert(motion.fontSize === '13px' && motion.lineHeight === '20px', 'assistant prose typography must use the compact 13px/20px token: ' + JSON.stringify(motion))
  assert(new Set(motion.samples.map((sample) => sample.length)).size >= 3, 'assistant text did not render as token-level SSE updates: ' + JSON.stringify(motion.samples))
  pass('real model uses standard renderers, ongoing indicator, compact type, and token-level SSE')

  const errors = cdp.events.filter((event) => event.method === 'Runtime.exceptionThrown')
  const slotCrashes = cdp.events.filter((event) => event.method === 'Runtime.consoleAPICalled').some((event) => JSON.stringify(event.params).includes('slot entry crashed'))
  assert(errors.length === 0, 'browser runtime exceptions: ' + JSON.stringify(errors))
  assert(slotCrashes === false, 'shell.overlay entry crashed')
  return { sessionId: settled.sessionId, toolSeq: taskTool.seq }
}

async function restartScenario(expected) {
  execFileSync('systemctl', ['--user', 'restart', 'dsh-lab.service'], { stdio: 'inherit' })
  await waitFor(async () => {
    try {
      const response = await fetch(base)
      return response.ok
    } catch {
      return false
    }
  }, '3082 after dsh-lab restart', 90_000, 1_000)
  const resumed = await waitFor(async () => {
    try {
      return await rpc('llm-assistant', 'assistant/snapshot')
    } catch {
      return undefined
    }
  }, 'assistant RPC after restart', 90_000, 1_000)
  assert(resumed.sessionId === expected.sessionId, 'assistant session changed across restart')
  const durable = resumed.items.find((item) => item.kind === 'tool' && item.name === 'task_reference' && item.seq === expected.toolSeq && item.status === 'done')
  assert(durable !== undefined, 'task_reference tool history did not survive restart')
  pass('assistant and task_reference tool history survive dsh-lab restart')

  await navigate()
  const visible = JSON.parse(await cdp.evaluate("JSON.stringify({ seat: document.querySelectorAll('.dsh-assistant-root').length, controls: Array.from(document.querySelectorAll('button')).some((node) => node.textContent?.trim() === '引用任务') || !!document.querySelector('.dsh-assistant-task-picker, .dsh-assistant-task-chip') })"))
  assert(visible.seat === 1, 'assistant seat missing after restart')
  assert(visible.controls === false, 'task reference controls returned after restart')
  pass('seat reconnects after restart')

  const logs = execFileSync('journalctl', ['--user', '-u', 'dsh-lab.service', '-n', '100', '--no-pager'], { encoding: 'utf8' })
  assert(logs.includes('task references ready'), 'task-reference readiness log missing')
  assert(logs.includes('worker tool isolation: host=all assistant=none duty=none PASS'), 'worker isolation PASS log missing')
  pass('reference service and worker isolation healthy')
}

try {
  const response = await fetch(base)
  assert(response.ok, '3082 is not healthy before E2E')
  await openBrowser()
  const expected = await browserScenario()
  await restartScenario(expected)
  console.log('E2E PASS ' + base.href)
} finally {
  cdp?.close()
  if (chrome !== undefined && chrome.exitCode === null) {
    const exited = new Promise((resolve) => { chrome.once('exit', resolve) })
    chrome.kill('SIGTERM')
    await Promise.race([exited, delay(5_000)])
  }
  let cleanupError
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      rmSync(profile, { recursive: true, force: true })
      cleanupError = undefined
      break
    } catch (error) {
      cleanupError = error
      await delay(250)
    }
  }
  if (cleanupError !== undefined) console.warn('WARN temporary Chrome profile cleanup failed: ' + String(cleanupError))
}
