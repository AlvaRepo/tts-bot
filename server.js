import 'dotenv/config'
import express from 'express'
import { WebSocketServer } from 'ws'
import { existsSync } from 'fs'
import { resolve } from 'path'
import {
  initDB,
  insertMessage,
  getHistory,
  getMessage,
  updateMessage,
  deleteMessage,
  getAudioProfilePreference,
  setAudioProfilePreference,
  sanitizeAudioProfilePreference,
  getMessageFilterConfig,
  setMessageFilterConfig,
  evaluateMessageFilter,
  AVAILABLE_TTS_VOICES,
  getTtsVoicePreference,
  setTtsVoicePreference,
  sanitizeTtsVoicePreference,
  getTtsPresetPreference,
  setTtsPresetPreference,
  sanitizeTtsPresetPreference,
  TTS_EMOTION_PRESETS,
  getKickBotConfig,
  setKickBotConfig
} from './supabase-db.js'
import { createMessageService } from './message-service.js'
import { createRouter } from './bot/router.js'
import { createKickBotRunner } from './kick-bot-runner.js'
import { createDonationWebhookRouter } from './webhooks/index.js'
import { queue } from './queue.js'

const PORT = parseInt(process.env.PORT ?? '49152', 10)
const WS_PORT = parseInt(process.env.WS_PORT ?? '49153', 10)
const MAX_LEN = parseInt(process.env.MAX_MESSAGE_LENGTH ?? '300', 10)
const RUNTIME_AUDIO_PROFILE = 'auto'

initDB()

const bootAudioProfilePreference = getAudioProfilePreference()
const bootAudioProfile = resolveAudioProfile(bootAudioProfilePreference, RUNTIME_AUDIO_PROFILE)
let currentAudioProfilePreference = bootAudioProfilePreference

const messageService = createMessageService({
  insertMessage,
  queue,
  maxMessageLength: MAX_LEN,
  filterMessage: evaluateMessageFilter
})

const botRuntime = {
  connected: false,
  lastSeenAt: null,
  lastEventAt: null,
  lastChannel: null,
  lastUser: null,
  lastContent: null,
  lastError: null
}

function updateBotRuntime(patch) {
  Object.assign(botRuntime, patch)
}

const kickBotRouter = createRouter({
  getConfig: getKickBotConfig,
  updateRuntime: updateBotRuntime,
  sendChatMessage: (text) => kickBotRunner?.sendChatMessage?.(text),
  queue,
  enqueueMessage: messageService.enqueueMessage,
  getHistory,
  getMessage,
  deleteMessage,
  setTtsVoicePreference,
  setTtsPresetPreference
})

const kickBotRunner = createKickBotRunner({
  getKickBotConfig,
  setKickBotConfig,
  updateBotRuntime,
  handleChatEvent: kickBotRouter.handleEvent,
  sendChatMessage: (text) => kickBotRunner.sendChatMessage?.(text),
  logger: console
})

let wss = null // Se inicializará cuando el servidor HTTP esté listo

function broadcast(event) {
  if (!wss) return // Early exit si WebSocket no está listo
  const data = JSON.stringify(event)
  for (const client of wss.clients) {
    if (client.readyState === 1) client.send(data)
  }
}

function resolveAudioProfile(preference, runtimeDefault) {
  const sanitized = sanitizeAudioProfilePreference(preference)
  return sanitized === 'auto' ? runtimeDefault : sanitized
}

broadcast.clientCount = () => {
  if (!wss) return 0
  let count = 0
  for (const client of wss.clients) {
    if (client.readyState === 1 && client.clientType === 'overlay') count += 1
  }
  return count
}

// wss.on('connection', ...) se movió al callback de app.listen()

const app = express()
app.use(express.json())

app.use('/webhooks', createDonationWebhookRouter({ enqueueMessage: messageService.enqueueMessage }))

app.post('/api/message', (req, res) => {
  messageService.handleHttpMessage(req, res)
})

app.get('/api/queue', (_req, res) => {
  res.json(queue.snapshot())
})

app.post('/api/control/:action', (req, res) => {
  const valid = ['pause', 'resume', 'stop', 'skip']
  if (!valid.includes(req.params.action)) return res.status(400).json({ error: 'invalid action' })
  queue.control(req.params.action)
  res.json({ ok: true })
})

app.post('/api/message/:id/cancel', async (req, res) => {
  const message = await getMessage(req.params.id)
  if (!message) return res.status(404).json({ error: 'not found' })
  const reason = typeof req.body?.reason === 'string' && req.body.reason.trim()
    ? req.body.reason.trim()
    : 'CANCELLED'

  const removed = queue.discard(message.id, reason)
  if (!removed) {
    updateMessage(message.id, { status: 'SKIPPED', error_msg: reason })
  }

  res.json({ ok: true })
})

app.post('/api/message/:id/restore', async (req, res) => {
  try {
    const message = await getMessage(req.params.id)
    if (!message) return res.status(404).json({ error: 'not found' })

    const restored = messageService.enqueueMessage({
      source: message.source,
      donor_name: message.donor_name,
      amount: message.amount,
      text: message.text
    })

    res.status(201).json({ ok: true, id: restored.id, restored_from: message.id })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

app.post('/api/message/:id/replay', async (req, res) => {
  try {
    const message = await getMessage(req.params.id)
    if (!message) return res.status(404).json({ error: 'not found' })

    const replay = messageService.enqueueMessage({
      source: message.source,
      donor_name: message.donor_name,
      amount: message.amount,
      text: message.text
    })

    res.status(201).json({ ok: true, id: replay.id, replay_of: message.id })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

app.delete('/api/message/:id', async (req, res) => {
  const message = await getMessage(req.params.id)
  if (!message) return res.status(404).json({ error: 'not found' })
  queue.discard(message.id, 'DELETED')
  deleteMessage(message.id)
  res.json({ ok: true })
})

app.get('/api/history', async (req, res) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit ?? '50', 10) || 50, 1), 200)
    const rows = await getHistory(limit, {
      query: typeof req.query.q === 'string' ? req.query.q.trim() : '',
      status: typeof req.query.status === 'string' ? req.query.status : 'all',
      source: typeof req.query.source === 'string' ? req.query.source : 'all'
    })

    res.json(rows.map(({ id, text, source, donor_name, amount, status, retries, created_at, error_msg }) => ({
      id,
      text,
      source,
      donor_name,
      amount,
      status,
      retries,
      created_at,
      error_msg
    })))
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

app.get('/api/filters', async (_req, res) => {
  try {
    const config = await getMessageFilterConfig()
    res.json(config)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

app.post('/api/filters', (req, res) => {
  const config = setMessageFilterConfig({
    enabled: Boolean(req.body?.enabled),
    blacklist: Array.isArray(req.body?.blacklist) ? req.body.blacklist : String(req.body?.blacklist ?? '').split(',')
  })
  res.json({ ok: true, ...config })
})

app.get('/api/bot/config', async (_req, res) => {
  try {
    const config = await getKickBotConfig()
    res.json(config)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

app.post('/api/bot/config', (req, res) => {
  const config = setKickBotConfig(req.body ?? {})
  res.json({ ok: true, ...config })
})

app.get('/api/bot/status', async (_req, res) => {
  try {
    const config = await getKickBotConfig()
    res.json({
      enabled: config.enabled,
      connected: botRuntime.connected,
      lastSeenAt: botRuntime.lastSeenAt,
      lastEventAt: botRuntime.lastEventAt,
      lastChannel: botRuntime.lastChannel,
      lastUser: botRuntime.lastUser,
      lastContent: botRuntime.lastContent,
      lastError: botRuntime.lastError,
      config
    })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

app.post('/api/bot/heartbeat', (req, res) => {
  botRuntime.connected = true
  botRuntime.lastSeenAt = Date.now()
  botRuntime.lastError = null
  if (typeof req.body?.channel === 'string') botRuntime.lastChannel = req.body.channel
  if (typeof req.body?.user === 'string') botRuntime.lastUser = req.body.user
  res.json({ ok: true })
})

app.post('/api/bot/event', async (req, res) => {
  try {
    const result = await kickBotRouter.handleEvent(req.body ?? {})
    botRuntime.lastSeenAt = Date.now()
    botRuntime.connected = true
    botRuntime.lastError = null
    res.json(result)
  } catch (error) {
    botRuntime.lastError = error.message
    res.status(500).json({ error: error.message })
  }
})

app.get('/api/audio-profile', (_req, res) => {
  res.json({
    preference: currentAudioProfilePreference,
    runtime: RUNTIME_AUDIO_PROFILE,
    effective: bootAudioProfile,
    apply_on_restart: currentAudioProfilePreference !== bootAudioProfilePreference
  })
})

app.post('/api/audio-profile', (req, res) => {
  const preference = sanitizeAudioProfilePreference(req.body?.preference)
  setAudioProfilePreference(preference)
  currentAudioProfilePreference = preference
  res.json({
    ok: true,
    preference,
    runtime: RUNTIME_AUDIO_PROFILE,
    effective: bootAudioProfile,
    apply_on_restart: preference !== bootAudioProfilePreference
  })
})

app.get('/api/tts-voice', async (_req, res) => {
  try {
    const voice = await getTtsVoicePreference()
    res.json({
      voice,
      available: AVAILABLE_TTS_VOICES
    })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

app.post('/api/tts-voice', (req, res) => {
  const voice = setTtsVoicePreference(sanitizeTtsVoicePreference(req.body?.voice))
  res.json({ ok: true, voice, available: AVAILABLE_TTS_VOICES })
})

app.get('/api/tts-preset', async (_req, res) => {
  try {
    const preset = await getTtsPresetPreference()
    res.json({
      preset,
      available: TTS_EMOTION_PRESETS
    })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

app.post('/api/tts-preset', (req, res) => {
  const preset = setTtsPresetPreference(sanitizeTtsPresetPreference(req.body?.preset))
  res.json({ ok: true, preset, available: TTS_EMOTION_PRESETS })
})

app.get('/audio/:id', (req, res) => {
  const filePath = resolve(`./audio_cache/${req.params.id}.mp3`)
  if (!existsSync(filePath)) return res.status(404).json({ error: 'not found' })
  res.sendFile(filePath)
})

app.get('/overlay', (_req, res) => {
  res.type('html').sendFile(resolve('./public/overlay.html'))
})

app.get('/panel', (_req, res) => {
  res.type('html').sendFile(resolve('./public/panel.html'))
})

const server = app.listen(PORT, () => {
  console.log(`HTTP  → http://localhost:${PORT}`)
  console.log(`WS    → ws://localhost:${PORT}`)
  console.log(`Panel → http://localhost:${PORT}/panel`)
  console.log(`OBS   → http://localhost:${PORT}/overlay`)
  
  // WebSocket en el mismo servidor HTTP
  try {
    wss = new WebSocketServer({ server })
    console.log('✅ WebSocket conectado al servidor HTTP en puerto', PORT)

    wss.on('connection', (ws, req) => {
      const url = new URL(req.url, 'http://localhost')
      ws.clientType = url.searchParams.get('client') ?? 'unknown'

      ws.on('message', raw => {
        try {
          const event = JSON.parse(raw.toString())
          if (event.type === 'audio:ended' && event.id) queue.audioEnded(event.id)
        } catch {
          // ignore malformed messages
        }
      })
    })

    queue.init(broadcast)
  } catch (error) {
    console.error('❌ Error creando WebSocketServer:', error)
  }
})

void kickBotRunner.start().catch(error => {
  updateBotRuntime({ connected: false, lastError: error.message })
  console.error('[kick-bot] failed to start:', error)
})
