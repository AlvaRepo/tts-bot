import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { setTimeout as delay } from 'node:timers/promises'
import { deriveDedupeKey, buildCanonicalDonationEvent } from '../webhooks/shared.js'
import { MessageQueue } from '../queue.js'
import { createResilience } from '../src/process-resilience.js'
import { computeReconnectDelay } from '../kick-bot-runner.js'
import { createReply, createRouter } from '../bot/router.js'
import {
  normalizePayPal,
  normalizeMercadoPago,
  normalizeStreamlabs,
  normalizeStreamElements,
  normalizeVipChatter,
  verifyPayPalAuth,
  verifyMercadoPagoAuth,
  verifyStreamlabsAuth,
  verifyStreamElementsAuth,
  verifyVipAuth,
  unresolvedProviderHeaderAssumptions
} from '../webhooks/index.js'

const ROOT_DIR = fileURLToPath(new URL('..', import.meta.url))

async function main() {
  await runUnitChecks()
  await runRecoveryChecks()
  await runRuntimeChecks()
  console.log('=== Smoke Test PASSED ===')
}

async function runUnitChecks() {
  assert.equal(deriveDedupeKey('paypal', 'evt-1', null), 'paypal:evt-1')
  assert.equal(deriveDedupeKey('vip', null, 'del-2'), 'vip:del-2')
  assert.equal(deriveDedupeKey('vip', null, null), null)

  const canonical = buildCanonicalDonationEvent({
    provider: 'paypal',
    provider_event_id: 'evt-99',
    donor_name: 'Ana',
    amount: 25,
    text: '',
    raw: { id: 'evt-99' }
  })
  assert.equal(canonical.provider, 'paypal')
  assert.equal(canonical.text, 'Donation from Ana — 25.00')

  const authOk = verifyPayPalAuth({
    headers: { 'x-paypal-webhook-token': 'paypal-secret' },
    env: { PAYPAL_WEBHOOK_TOKEN: 'paypal-secret' }
  })
  assert.equal(authOk.ok, true)

  const authFail = verifyMercadoPagoAuth({
    headers: { 'x-mercadopago-webhook-token': 'wrong' },
    env: { MERCADOPAGO_WEBHOOK_TOKEN: 'mercado-secret' }
  })
  assert.equal(authFail.ok, false)
  assert.equal(authFail.status, 401)

  const paypal = normalizePayPal({
    body: { event_id: 'pp-1', donor_name: 'Maria', amount: '10.50', text: 'Tip' }
  })
  assert.equal(paypal.ok, true)
  assert.equal(paypal.event.provider, 'paypal')
  assert.equal(paypal.event.text, 'Tip')

  const mercadopago = normalizeMercadoPago({
    body: { id: 'mp-1', payer: { first_name: 'Juan' }, transaction_amount: 15, message: 'Hola' }
  })
  assert.equal(mercadopago.ok, true)
  assert.equal(mercadopago.event.provider, 'mercadopago')

  const streamlabs = normalizeStreamlabs({ body: { event_id: 'sl-1', name: 'Luz', amount: 5, message: 'Gracias' } })
  assert.equal(streamlabs.ok, true)

  const streamelements = normalizeStreamElements({ body: { id: 'se-1', display_name: 'Neo', value: 8, note: 'Buenísimo' } })
  assert.equal(streamelements.ok, true)

  const vip = normalizeVipChatter({ body: { message_id: 'vip-1', username: 'VIPChatter', text: 'Apoyo' } })
  assert.equal(vip.ok, true)
  assert.equal(vip.event.amount, null)

  assert.ok(unresolvedProviderHeaderAssumptions.paypal.length > 0)

  await runReplyFailureChecks()
}

async function runReplyFailureChecks() {
  {
    const runtime = {}
    const reply = createReply(
      async () => ({ ok: false, error: 'send failed' }),
      patch => Object.assign(runtime, patch)
    )

    await assert.rejects(async () => reply('hola'), /send failed/)
    assert.equal(runtime.lastError, 'send failed')
  }

  {
    const runtime = {}
    const reply = createReply(
      async () => ({ ok: true, messageId: 'msg-1' }),
      patch => Object.assign(runtime, patch)
    )

    const result = await reply('hola')
    assert.deepEqual(result, { ok: true, messageId: 'msg-1' })
    assert.equal(runtime.lastError, undefined)
  }

  {
    const runtime = {}
    const router = createRouter({
      getConfig: async () => ({ prefix: '!', commandPermissions: { help: ['streamer', 'moderator', 'vip', 'subscriber', 'viewer'] } }),
      updateRuntime: patch => Object.assign(runtime, patch),
      sendChatMessage: async () => ({ ok: false, error: 'send failed' })
    })

    await assert.rejects(
      async () => router.handleEvent({ username: 'streamer', role: 'streamer', content: '!help' }),
      /send failed/
    )
    assert.equal(runtime.lastError, 'send failed')
  }

  {
    const runtime = {}
    const router = createRouter({
      getConfig: async () => ({ prefix: '!', commandPermissions: { help: ['streamer', 'moderator', 'vip', 'subscriber', 'viewer'] } }),
      updateRuntime: patch => Object.assign(runtime, patch),
      sendChatMessage: async () => ({ ok: true, messageId: 'msg-2' })
    })

    const result = await router.handleEvent({ username: 'streamer', role: 'streamer', content: '!help' })
    assert.deepEqual(result, { handled: true, action: 'help' })
    assert.equal(runtime.lastError, undefined)
  }

}

async function runRecoveryChecks() {
  const queue = new MessageQueue({
    loadRecoverableMessages: async () => ([
      { id: 'm1', text: 'primero', status: 'QUEUED', created_at: '2026-05-11T10:00:00.000Z' },
      { id: 'm2', text: 'segundo', status: 'PLAYING', created_at: '2026-05-11T10:01:00.000Z' },
      { id: 'm3', text: 'terminal', status: 'DONE', created_at: '2026-05-11T10:02:00.000Z' }
    ])
  })

  const hydrated = await queue.rehydrate()
  assert.equal(hydrated.recoveredCount, 2)
  const secondHydrate = await queue.rehydrate()
  assert.equal(secondHydrate.alreadyRehydrated, true)
  assert.equal(secondHydrate.recoveredCount, 2)
  assert.equal(queue.snapshot().pendingCount, 2)
  assert.equal(queue.snapshot().state, 'idle')

  const d1 = computeReconnectDelay(1, () => 1)
  const d2 = computeReconnectDelay(2, () => 1)
  const d99 = computeReconnectDelay(99, () => 1)
  assert.ok(d2 > d1)
  assert.ok(d99 <= 60000)

  let exitCode = null
  const bootStatus = { hydrated: false, error: null }
  const resilience = createResilience({
    server: { close: cb => cb?.() },
    wss: { close: cb => cb?.() },
    kickBotRunner: { isStarted: () => false, stop: async () => {} },
    queue: { control: () => {} },
    bootStatus,
    exitProcess: code => { exitCode = code }
  })

  assert.equal(resilience.ready().status, 'degraded')
  bootStatus.hydrated = true
  const ready = resilience.ready()
  assert.equal(ready.status, 'ok')
  assert.equal(ready.connected, false)

  await resilience.shutdown(1)
  assert.equal(exitCode, 1)

  let rejectionExit = null
  const rejectionResilience = createResilience({
    server: { close: cb => cb?.() },
    wss: { close: cb => cb?.() },
    kickBotRunner: { isStarted: () => false, stop: async () => {} },
    queue: { control: () => {} },
    bootStatus: { hydrated: true, error: null },
    exitProcess: code => { rejectionExit = code }
  })

  process.emit('unhandledRejection', new Error('boom'), Promise.resolve())
  await delay(1100)
  assert.equal(rejectionExit, 1)
}

async function runRuntimeChecks() {
  const tempRoot = mkdtempSync(join(tmpdir(), 'tts-free-smoke-'))
  const audioDir = join(tempRoot, 'audio_cache')
  const dbPath = join(tempRoot, 'messages.db')
  const port = 3199
  const wsPort = 3200
  const baseUrl = `http://127.0.0.1:${port}`

  const env = {
    ...process.env,
    PORT: String(port),
    WS_PORT: String(wsPort),
    MESSAGES_DB_PATH: dbPath,
    AUDIO_CACHE_DIR: audioDir,
    TTS_MOCK: '1',
    PAYPAL_WEBHOOK_TOKEN: 'paypal-secret',
    MERCADOPAGO_WEBHOOK_TOKEN: 'mercado-secret',
    STREAMLABS_WEBHOOK_TOKEN: 'streamlabs-secret',
    STREAMELEMENTS_WEBHOOK_TOKEN: 'streamelements-secret',
    VIP_CHAT_SECRET: 'vip-secret'
  }

  const child = spawn(process.execPath, ['server.js'], {
    cwd: ROOT_DIR,
    env,
    stdio: ['ignore', 'pipe', 'pipe']
  })

  const logs = []
  const ready = await waitForServerReady(child, logs)
  assert.equal(ready, true, `server no inició: ${logs.join('\n')}`)
  await waitForBootReady(baseUrl)

  try {
    await testManualFlow(baseUrl, audioDir)
    await testWebhookProvider(baseUrl, 'paypal', 'x-paypal-webhook-token', 'paypal-secret', {
      event_id: 'pp-event-1',
      donor_name: 'Maria',
      amount: 12,
      text: 'PayPal tip'
    })
    await testWebhookProvider(baseUrl, 'mercadopago', 'x-mercadopago-webhook-token', 'mercado-secret', {
      id: 'mp-event-1',
      payer: { first_name: 'Juan' },
      transaction_amount: 18,
      text: 'MercadoPago tip'
    })
    await testWebhookProvider(baseUrl, 'streamlabs', 'x-streamlabs-token', 'streamlabs-secret', {
      event_id: 'sl-event-1',
      name: 'Luca',
      amount: 5,
      message: 'Streamlabs tip'
    })
    await testWebhookProvider(baseUrl, 'streamelements', 'x-streamelements-token', 'streamelements-secret', {
      id: 'se-event-1',
      display_name: 'Mica',
      value: 7,
      note: 'StreamElements tip'
    })
    await testWebhookProvider(baseUrl, 'vip', 'x-vip-token', 'vip-secret', {
      message_id: 'vip-event-1',
      username: 'ChatVIP',
      text: 'VIP support'
    })

    await testAuthAndMalformedPaths(baseUrl)
    await testSystemRoutes(baseUrl)
    await testBotReplyFailurePropagation(baseUrl)
    await testAudioProfilePreference(child, baseUrl, env)
  } finally {
    child.kill('SIGTERM')
    await delay(500)
    if (!child.killed) child.kill('SIGKILL')
    rmSync(tempRoot, { recursive: true, force: true })
  }
}

async function testAudioProfilePreference(child, baseUrl, env) {
  const initial = await fetch(`${baseUrl}/api/audio-profile`).then(r => r.json())
  assert.equal(typeof initial.preference, 'string')
  assert.equal(typeof initial.effective, 'string')
  assert.equal(typeof initial.apply_on_restart, 'boolean')

  const invalid = await fetch(`${baseUrl}/api/audio-profile`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ preference: 'BROKEN' })
  }).then(r => r.json())
  assert.equal(invalid.preference, 'auto')
  assert.equal(typeof invalid.effective, 'string')
  assert.equal(typeof invalid.apply_on_restart, 'boolean')

  const saved = await fetch(`${baseUrl}/api/audio-profile`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ preference: 'high' })
  }).then(r => r.json())
  assert.equal(saved.ok, true)
  assert.equal(saved.preference, 'high')
  assert.equal(typeof saved.effective, 'string')
  assert.equal(typeof saved.apply_on_restart, 'boolean')

  const afterSave = await fetch(`${baseUrl}/api/audio-profile`).then(r => r.json())
  assert.equal(afterSave.preference, 'high')
  assert.equal(typeof afterSave.effective, 'string')
  assert.equal(typeof afterSave.apply_on_restart, 'boolean')
}

async function waitForBootReady(baseUrl, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs
  let lastReady = null

  while (Date.now() < deadline) {
    const ready = await fetch(`${baseUrl}/ready`).then(r => r.json())
    lastReady = ready
    if (ready.status === 'ok' && ready.hydrated) return ready
    await delay(250)
  }

  throw new Error(`boot did not become ready within ${timeoutMs}ms (last status: ${lastReady?.status ?? 'missing'}, hydrated: ${lastReady?.hydrated ?? 'n/a'}, bootError: ${lastReady?.bootError ?? 'n/a'})`)
}

async function testManualFlow(baseUrl, audioDir) {
  const res = await fetch(`${baseUrl}/api/message`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text: 'Mensaje manual de prueba', source: 'manual', donor_name: 'Ana', amount: 9.5 })
  })
  assert.equal(res.status, 201)
  const { id } = await res.json()
  assert.equal(typeof id, 'string')

  const row = await waitForMessage(baseUrl, id, msg => msg.status === 'DONE')
  assert.equal(row.status, 'DONE')
  assert.equal(row.source, 'manual')
  assert.equal(row.donor_name, 'Ana')
  assert.equal(row.amount, 9.5)
  assert.ok(existsSync(join(audioDir, `${id}.mp3`)))
}

async function testWebhookProvider(baseUrl, provider, tokenHeader, token, body) {
  const suffix = randomUUID().slice(0, 8)
  const payload = { ...body }
  if (Object.prototype.hasOwnProperty.call(payload, 'event_id')) payload.event_id = `${payload.event_id}-${suffix}`
  if (Object.prototype.hasOwnProperty.call(payload, 'id')) payload.id = `${payload.id}-${suffix}`
  if (Object.prototype.hasOwnProperty.call(payload, 'message_id')) payload.message_id = `${payload.message_id}-${suffix}`
  if (Object.prototype.hasOwnProperty.call(payload, '_id')) payload._id = `${payload._id}-${suffix}`
  if (Object.prototype.hasOwnProperty.call(payload, 'text')) payload.text = `${payload.text} [${suffix}]`
  if (Object.prototype.hasOwnProperty.call(payload, 'note')) payload.note = `${payload.note} [${suffix}]`
  if (Object.prototype.hasOwnProperty.call(payload, 'message')) payload.message = `${payload.message} [${suffix}]`

  const uniqueText = payload.text ?? payload.note ?? payload.message ?? `${provider} tip [${suffix}]`
  const headers = { 'content-type': 'application/json', [tokenHeader]: token }

  const first = await fetch(`${baseUrl}/webhooks/${provider}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload)
  })
  assert.equal(first.status, 200)
  const firstJson = await first.json()
  assert.equal(firstJson.ok, true)
  assert.equal(firstJson.duplicate, false)
  assert.equal(typeof firstJson.id, 'string')

  const second = await fetch(`${baseUrl}/webhooks/${provider}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload)
  })
  assert.equal(second.status, 200)
  const secondJson = await second.json()
  assert.equal(secondJson.duplicate, true)

  const rows = await waitForHistory(baseUrl, items => items.filter(row => row.text === uniqueText).length >= 1)
  const matching = rows.filter(row => row.text === uniqueText)
  assert.equal(matching.length, 1, `${provider} duplicated history rows for ${uniqueText}`)
}

async function testAuthAndMalformedPaths(baseUrl) {
  const authFail = await fetch(`${baseUrl}/webhooks/paypal`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-paypal-webhook-token': 'wrong' },
    body: JSON.stringify({ event_id: 'pp-bad', amount: 1, text: 'bad' })
  })
  assert.equal(authFail.status, 401)

  const malformed = await fetch(`${baseUrl}/webhooks/mercadopago`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-mercadopago-webhook-token': 'mercado-secret' },
    body: JSON.stringify({ amount: 'not-a-number', text: 'malformed' })
  })
  assert.equal(malformed.status, 400)
}

async function testSystemRoutes(baseUrl) {
  const history = await fetch(`${baseUrl}/api/history`).then(r => r.json())
  assert.ok(Array.isArray(history))
  assert.ok(history.length >= 1)
  const sample = history[0]
  for (const key of ['id', 'text', 'source', 'donor_name', 'amount', 'status', 'retries', 'created_at', 'error_msg']) {
    assert.ok(Object.prototype.hasOwnProperty.call(sample, key), `history missing ${key}`)
  }

  const pause = await fetch(`${baseUrl}/api/control/pause`, { method: 'POST' }).then(r => r.json())
  assert.equal(pause.ok, true)

  const invalid = await fetch(`${baseUrl}/api/control/explode`, { method: 'POST' })
  assert.equal(invalid.status, 400)

  const notes = await fetch(`${baseUrl}/webhooks/notes`).then(r => r.json())
  assert.ok(notes.paypal)
  const providers = await fetch(`${baseUrl}/webhooks`).then(r => r.json())
  assert.equal(providers.ok, true)
  assert.ok(providers.providers.includes('paypal'))

  const overlayRes = await fetch(`${baseUrl}/overlay`)
  assert.equal(overlayRes.status, 200)
  const overlayHtml = await overlayRes.text()
  assert.ok(!overlayHtml.includes('<form'), 'overlay must not include forms')
  assert.ok(overlayHtml.includes('id="player"'))
  assert.ok(overlayHtml.includes('audio:ended'))

  const panelRes = await fetch(`${baseUrl}/panel`)
  assert.equal(panelRes.status, 200)
  const panelHtml = await panelRes.text()
  assert.ok(!panelHtml.includes('<form'), 'panel must not include forms')
  assert.ok(panelHtml.includes('id="audioProfile"'))
  assert.ok(panelHtml.includes('id="saveAudioProfile"'))
  assert.ok(panelHtml.includes('id="audioProfileStatus"'))
  assert.ok(panelHtml.includes('id="botEnabled"'))
  assert.ok(panelHtml.includes('id="botAllowCommandsFromVip"'))
  assert.ok(panelHtml.includes('id="botStatus"'))

  const botConfig = await fetch(`${baseUrl}/api/bot/config`).then(r => r.json())
  assert.ok(Object.prototype.hasOwnProperty.call(botConfig, 'enabled'))
  assert.equal(typeof botConfig.allowCommandsFromVip, 'boolean')

  const botSaved = await fetch(`${baseUrl}/api/bot/config`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ enabled: true, channel: 'demo', prefix: '!', allowTtsFromChat: false, allowCommandsFromMods: true, allowCommandsFromVip: true })
  }).then(r => r.json())
  assert.equal(botSaved.ok, true)
  assert.equal(botSaved.channel, 'demo')
  assert.equal(botSaved.allowCommandsFromVip, true)

   const botStatus = await fetch(`${baseUrl}/api/bot/status`).then(r => r.json())
   assert.equal(botStatus.enabled, true)

   // Test health endpoint - should return 200 with { status: 'ok' }
   const healthRes = await fetch(`${baseUrl}/health`);
   assert.equal(healthRes.status, 200);
   const healthData = await healthRes.json();
   assert.equal(healthData.status, 'ok');
   assert.ok(Number.isInteger(healthData.uptime));

   // Test ready endpoint - should return 200 or 503 with status field
   const readyRes = await fetch(`${baseUrl}/ready`);
   assert.ok([200, 503].includes(readyRes.status));
   const readyData = await readyRes.json();
   assert.ok(Object.prototype.hasOwnProperty.call(readyData, 'status'));
   assert.ok(Object.prototype.hasOwnProperty.call(readyData, 'connected'));
   assert.ok(Object.prototype.hasOwnProperty.call(readyData, 'uptime'));
 }

async function testBotReplyFailurePropagation(baseUrl) {
  await fetch(`${baseUrl}/api/bot/config`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ enabled: true, channel: 'demo', prefix: '!', allowTtsFromChat: false, allowCommandsFromMods: true, allowCommandsFromVip: false })
  })

  const helpEvent = await fetch(`${baseUrl}/api/bot/event`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ platform: 'kick', channel: 'demo', username: 'viewer', role: 'viewer', content: '!help' })
  })
  assert.equal(helpEvent.status, 500)
  const helpBody = await helpEvent.json()
  assert.equal(typeof helpBody.error, 'string')
  assert.ok(helpBody.error.length > 0)

  const status = await fetch(`${baseUrl}/api/bot/status`).then(r => r.json())
  assert.equal(status.lastError, helpBody.error)
  assert.equal(typeof status.lastEventAt, 'number')
}

async function waitForServerReady(child, logs) {
  return await new Promise((resolve, reject) => {
    let resolved = false
    const timeout = setTimeout(() => {
      if (!resolved) reject(new Error('server start timeout'))
    }, 15_000)

    child.stdout.on('data', chunk => {
      const text = chunk.toString()
      logs.push(text.trim())
      if (!resolved && text.includes('HTTP')) {
        resolved = true
        clearTimeout(timeout)
        resolve(true)
      }
    })

    child.stderr.on('data', chunk => {
      const text = chunk.toString()
      logs.push(text.trim())
    })

    child.on('exit', code => {
      if (!resolved) {
        clearTimeout(timeout)
        reject(new Error(`server exited early with code ${code}`))
      }
    })
  })
}

async function waitForHistory(baseUrl, predicate, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const rows = await fetch(`${baseUrl}/api/history`).then(r => r.json())
    if (predicate(rows)) return rows
    await delay(250)
  }
  throw new Error('history predicate timeout')
}

async function waitForMessage(baseUrl, id, predicate, timeoutMs = 45_000) {
  const deadline = Date.now() + timeoutMs
  let lastRow = null
  while (Date.now() < deadline) {
    const rows = await fetch(`${baseUrl}/api/history`).then(r => r.json())
    const row = rows.find(item => item.id === id)
    if (row) {
      lastRow = row
      if (row.status === 'FAILED') {
        throw new Error(`message ${id} failed early: ${row.error_msg ?? 'unknown error'}`)
      }
      if (predicate(row)) return row
    }
    await delay(250)
  }
  const status = lastRow?.status ?? 'missing'
  const errorMsg = lastRow?.error_msg ?? 'n/a'
  throw new Error(`message ${id} did not satisfy predicate within ${timeoutMs}ms (last status: ${status}, error: ${errorMsg})`)
}

main().catch(async error => {
  console.error('SMOKE TEST FAILED:', error)
  process.exitCode = 1
})
