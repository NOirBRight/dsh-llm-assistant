#!/usr/bin/env node
import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const base = new URL('http://127.0.0.1:3082/')
const chromeBin = process.env.CHROME_BIN ?? 'google-chrome'
const debugPort = Number(process.env.E2E_CDP_PORT ?? '9333')
const outDir = join(process.cwd(), 'docs/images')
mkdirSync(outDir, { recursive: true })
const profile = mkdtempSync(join(tmpdir(), 'dsh-assistant-shots-'))

const delay = (ms) => new Promise((r) => setTimeout(r, ms))
async function waitFor(check, label, timeoutMs = 45_000) {
  const deadline = Date.now() + timeoutMs
  let last
  while (Date.now() < deadline) {
    try { const v = await check(); if (v) return v } catch (e) { last = e }
    await delay(250)
  }
  throw new Error('timeout ' + label + (last ? ': ' + last : ''))
}

class Cdp {
  constructor(socket) {
    this.socket = socket
    this.nextId = 0
    this.pending = new Map()
    socket.onmessage = (message) => {
      const value = JSON.parse(String(message.data))
      if (value.id === undefined) return
      const pending = this.pending.get(value.id)
      this.pending.delete(value.id)
      if (value.error) pending.reject(new Error(JSON.stringify(value.error)))
      else pending.resolve(value.result)
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
    return result.result?.value
  }
}

const chrome = spawn(chromeBin, [
  '--headless=new',
  '--disable-gpu',
  '--no-first-run',
  '--no-default-browser-check',
  '--window-size=1440,900',
  '--force-device-scale-factor=1',
  '--hide-scrollbars',
  '--user-data-dir=' + profile,
  '--remote-debugging-port=' + debugPort,
  'about:blank',
], { stdio: 'ignore' })

const save = async (cdp, name, clip) => {
  const result = await cdp.call('Page.captureScreenshot', {
    format: 'png',
    fromSurface: true,
    ...(clip === undefined ? {} : { clip }),
  })
  const path = join(outDir, name)
  writeFileSync(path, Buffer.from(result.data, 'base64'))
  console.log('wrote', path)
}

try {
  const target = await waitFor(async () => {
    const res = await fetch('http://127.0.0.1:' + debugPort + '/json/list')
    if (!res.ok) return false
    const list = await res.json()
    return list.find((entry) => entry.type === 'page') ?? list[0]
  }, 'cdp page')
  const ws = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject })
  const cdp = new Cdp(ws)
  await cdp.call('Page.enable')
  await cdp.call('Runtime.enable')
  await cdp.call('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false })
  await cdp.call('Page.navigate', { url: base.href })
  await waitFor(() => cdp.evaluate("document.readyState === 'complete'"), 'load')
  await waitFor(() => cdp.evaluate("!!document.querySelector('.dsh-assistant-pet,[aria-label=\\'展开助理\\'],[aria-label=\\'Open assistant\\']')"), 'pet', 60_000)
  await cdp.evaluate("(function(){ var open = document.querySelector('[aria-label=\\'Open sidebar\\']'); if (open) open.click(); var nodes = document.querySelectorAll('button, [role=button], div'); for (var i = 0; i < nodes.length; i++) { var t = (nodes[i].textContent || '').trim(); if (t === 'Ungrouped' || t.indexOf('Ungrouped') === 0) { nodes[i].click(); break; } } })()")
  try {
    await waitFor(() => cdp.evaluate("!!document.querySelector('[aria-label^=\\'Session actions for \\']')"), 'session row', 25_000)
    await cdp.evaluate("(function(){ var action = document.querySelector('[aria-label^=\\'Session actions for \\']'); if (action && action.parentElement) action.parentElement.click(); })()")
    await waitFor(() => cdp.evaluate("document.querySelector('[data-composer-card],[data-phase=\\'active\\']') !== null"), 'active session', 20_000)
    console.log('opened a session')
  } catch {
    console.log('no session list yet, capturing hero')
  }
  await cdp.evaluate("(function(){ var close = document.querySelector('[aria-label=\\'收起\\'],[aria-label=\\'Close\\']'); if (close) close.click(); })()")
  await delay(800)
  await save(cdp, 'seat-closed.png')
  await cdp.evaluate("(function(){ var pet = document.querySelector('[aria-label=\\'展开助理\\'],[aria-label=\\'Open assistant\\']'); if (pet) pet.click(); })()")
  await waitFor(() => cdp.evaluate("!!document.querySelector('.dsh-assistant-panel,[aria-label=\\'DeepSeek 小管家\\'],[aria-label=\\'DeepSeek Assistant\\']')"), 'panel')
  await delay(800)
  await save(cdp, 'seat-open.png')
  const box = await cdp.evaluate("(function(){ var el = document.querySelector('.dsh-assistant-panel'); if (!el) return null; var r = el.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height, scale: 1 }; })()")
  if (box && box.width > 0) await save(cdp, 'seat-panel.png', box)
  ws.close()
} finally {
  chrome.kill()
  try { rmSync(profile, { recursive: true, force: true }) } catch { /* chrome shutdown race */ }
}
