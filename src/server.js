import 'dotenv/config'
import express from 'express'
import { WebSocketServer } from 'ws'
import { existsSync } from 'fs'
import { resolve, dirname } from 'path'
import crypto from 'crypto'
import { fileURLToPath } from 'url'

// __dirname polyfill for ES modules
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
// Force deploy: 01916e3 fix for customer-connect

// Encriptación AES-256 para tokens sensibles
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY // 32 bytes (64 hex chars)
const ALGORITHM = 'aes-256-gcm'

function encrypt(text) {
  if (!text || !ENCRYPTION_KEY) return text
  try {
    const key = Buffer.from(ENCRYPTION_KEY, 'hex')
    const iv = crypto.randomBytes(16)
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv)
    let encrypted = cipher.update(text, 'utf8', 'hex')
    encrypted += cipher.final('hex')
    const authTag = cipher.getAuthTag()
    return iv.toString('hex') + ':' + authTag.toString('hex') + ':' + encrypted
  } catch (e) {
    console.error('[encrypt] Error:', e.message)
    return text
  }
}

function decrypt(encryptedText) {
  if (!encryptedText || !ENCRYPTION_KEY) return encryptedText
  try {
    const parts = encryptedText.split(':')
    if (parts.length !== 3) return encryptedText // No encriptado o formato viejo
    const key = Buffer.from(ENCRYPTION_KEY, 'hex')
    const iv = Buffer.from(parts[0], 'hex')
    const authTag = Buffer.from(parts[1], 'hex')
    const encrypted = parts[2]
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv)
    decipher.setAuthTag(authTag)
    let decrypted = decipher.update(encrypted, 'hex', 'utf8')
    decrypted += decipher.final('utf8')
    return decrypted
  } catch (e) {
    console.error('[decrypt] Error:', e.message)
    return encryptedText
  }
}

function isEncrypted(text) {
  if (!text) return false
  const parts = text.split(':')
  return parts.length === 3 && parts[0].length === 32 && parts[1].length === 32
}
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
  getAudioVolume,
  setAudioVolume,
  TTS_EMOTION_PRESETS,
  getKickBotConfig,
  setKickBotConfig
} from '../supabase-db.js'
import { createMessageService } from '../message-service.js'
import { createRouter } from '../bot/router.js'
import { createKickBotRunner } from '../kick-bot-runner.js'
import { createDonationWebhookRouter } from '../webhooks/index.js'
import { queue } from '../queue.js'

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

// Mutable reference para el runner - se setea después de crear el runner
let kickBotRunnerRef = null

const kickBotRouter = createRouter({
  getConfig: getKickBotConfig,
  updateRuntime: updateBotRuntime,
  sendChatMessage: (text) => kickBotRunnerRef?.sendChatMessage?.(text),
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
  sendChatMessage: (text) => kickBotRunnerRef?.sendChatMessage?.(text),
  // Callback para guardar tokens cuando se hace refresh
  onCustomerTokensRefreshed: async (accessToken, refreshToken, broadcasterId) => {
    try {
      const encryptedRefreshToken = refreshToken ? encrypt(refreshToken) : null
      const currentConfig = await getKickBotConfig()
      await setKickBotConfig({
        ...currentConfig,
        customerAccessToken: accessToken,
        customerRefreshToken: encryptedRefreshToken,
        customerBroadcasterId: broadcasterId
      })
      console.log('[onCustomerTokensRefreshed] Saved (encrypted)')
    } catch (e) {
      console.error('[onCustomerTokensRefreshed] Error:', e.message)
    }
  },
  logger: console
})

// Set the reference AFTER creating the runner
kickBotRunnerRef = kickBotRunner

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

// Endpoint para guardar los tokens del cliente (para TTS en canal del cliente)
app.post('/api/bot/customer-tokens', async (req, res) => {
  // Verificar API key de admin (si está configurada)
  const ADMIN_API_KEY = process.env.ADMIN_API_KEY
  const providedKey = req.headers['x-admin-key']
  
  if (ADMIN_API_KEY && providedKey !== ADMIN_API_KEY) {
    return res.status(403).json({ error: 'Forbidden' })
  }
  
  try {
    const { accessToken, refreshToken, broadcasterId } = req.body
    
    if (!accessToken || !broadcasterId) {
      return res.status(400).json({ error: 'accessToken y broadcasterId son requeridos' })
    }
    
    console.log('[customer-tokens] Saving customer tokens with broadcasterId:', broadcasterId)
    
    // Guardar en el runner
    kickBotRunner.setCustomerTokens(accessToken, refreshToken || null, broadcasterId)
    
    // Encriptar refresh_token antes de guardar en Supabase
    const encryptedRefreshToken = refreshToken ? encrypt(refreshToken) : null
    
    // Guardar en config de Supabase
    const currentConfig = await getKickBotConfig()
    const updatedConfig = await setKickBotConfig({
      ...currentConfig,
      customerAccessToken: accessToken,
      customerRefreshToken: encryptedRefreshToken, // Guardar encriptado
      customerBroadcasterId: broadcasterId
    })
    
    console.log('[customer-tokens] Saved (refresh_token encrypted):', !!encryptedRefreshToken)
    
    res.json({ ok: true, broadcasterId })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Endpoint: Obtener URL de OAuth para que el cliente conecte su cuenta
app.get('/api/bot/customer-oauth-url', async (_req, res) => {
  try {
    const oauthData = await kickBotRunner.getCustomerOAuthUrl()
    if (oauthData) {
      res.json({ url: oauthData.url, codeVerifier: oauthData.codeVerifier })
    } else {
      res.status(500).json({ error: 'OAuth not configured' })
    }
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Callback OAuth para cliente - automático sin copy-paste
app.get('/oauth/customer-callback', async (req, res) => {
  const { code, error: oauthError, state } = req.query
  
  console.log('[customer-callback] Incoming callback:', { code: code ? 'present' : 'missing', error: oauthError, state: state ? 'present' : 'missing' })
  
  if (oauthError) {
    console.error('[customer-callback] OAuth error:', oauthError)
    return res.redirect('/customer-connect?error=' + oauthError)
  }
  
  if (!code) {
    console.error('[customer-callback] Missing code')
    return res.redirect('/customer-connect?error=missing_code')
  }
  
  // Extraer codeVerifier del state
  let codeVerifier = null
  if (state && typeof state === 'string') {
    try {
      const decoded = Buffer.from(state, 'base64').toString()
      const parts = decoded.split(':')
      if (parts.length >= 2) {
        codeVerifier = parts[1]
      }
    } catch (e) {
      console.error('[customer-callback] Failed to parse state:', e.message)
    }
  }
  
  console.log('[customer-callback] codeVerifier:', codeVerifier ? 'present' : 'null')
  
  try {
    // Intercambiar code por tokens para el cliente
    const result = await kickBotRunner.exchangeCustomerCode(code, codeVerifier)
    
    console.log('[customer-callback] Exchange result:', JSON.stringify(result))
    
    if (result.ok) {
      // Obtener datos adicionales del usuario
      let username = null
      let chatroomId = null
      
      try {
        const userRes = await fetch('https://api.kick.com/public/v1/users/me', {
          headers: { 'Authorization': `Bearer ${result.accessToken}` }
        })
        const userData = await userRes.json()
        
        console.log('[customer-callback] User data:', JSON.stringify(userData))
        
        username = userData?.data?.username || userData?.username || null
        chatroomId = userData?.data?.chatroom?.id || userData?.chatroom?.id || null
        
        console.log('[customer-callback] Parsed username:', username, 'chatroomId:', chatroomId)
      } catch (userErr) {
        console.error('[customer-callback] Failed to fetch user data:', userErr.message)
      }
      
      // Guardar tokens en config
      const currentConfig = await getKickBotConfig()
      await setKickBotConfig({
        ...currentConfig,
        customerAccessToken: result.accessToken,
        customerRefreshToken: result.refreshToken,
        customerBroadcasterId: result.broadcasterId,
        customerUsername: username,
        customerChatroomId: chatroomId
      })
      
      // También guardar en memoria del runner
      kickBotRunner.setCustomerTokens(result.accessToken, result.refreshToken, result.broadcasterId)
      
      console.log('[customer-callback] Customer tokens saved successfully')
      
      res.redirect('/customer-connect?success=1')
    } else {
      console.error('[customer-callback] Exchange failed:', result.error)
      res.redirect('/customer-connect?error=' + encodeURIComponent(result.error || 'exchange_failed'))
    }
  } catch (err) {
    console.error('[customer-callback] Exception:', err.message)
    console.error(err.stack)
    res.redirect('/customer-connect?error=' + encodeURIComponent(err.message))
  }
})

// Serve la página de conexión del cliente
app.get('/customer-connect', (_req, res) => {
  const filePath = resolve(__dirname, '../public/customer-connect.html')
  res.type('html').sendFile(filePath)
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

// OAuth endpoints for bot chat
app.get('/api/bot/oauth-url', async (_req, res) => {
  try {
    console.log('[oauth] KICK_OAUTH_CLIENT_ID:', process.env.KICK_OAUTH_CLIENT_ID ? 'set' : 'NOT SET')
    const oauthData = await kickBotRunner.getOAuthUrl()
    if (!oauthData) {
      console.log('[oauth] getOAuthUrl returned null')
      return res.status(400).json({ error: 'OAuth not configured - check KICK_OAUTH_CLIENT_ID env var' })
    }
    // Store codeVerifier temporarily (in production, use session/redis)
    res.json({ url: oauthData.url, state: oauthData.state, codeVerifier: oauthData.codeVerifier })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

app.post('/api/bot/oauth-exchange', async (req, res) => {
  try {
    const { code, codeVerifier, isCustomer = false } = req.body
    console.log('[oauth-exchange] code:', code ? code.substring(0, 10) + '...' : 'missing')
    console.log('[oauth-exchange] codeVerifier:', codeVerifier ? codeVerifier.substring(0, 10) + '...' : 'missing')
    console.log('[oauth-exchange] isCustomer:', isCustomer)
    if (!code) {
      return res.status(400).json({ error: 'Missing code' })
    }
    // Try exchange - codeVerifier is optional now (will use stored if available)
    const result = await kickBotRunner.exchangeCode(code, codeVerifier)
    console.log('[oauth-exchange] result:', JSON.stringify(result))
    
    // Si es para el cliente (isCustomer), también obtener su broadcaster_user_id
    if (result.ok && isCustomer && result.accessToken) {
      console.log('[oauth-exchange] Fetching customer user info...')
      try {
        const userRes = await fetch('https://api.kick.com/public/v1/users/me', {
          headers: { 'Authorization': `Bearer ${result.accessToken}` }
        })
        const userData = await userRes.json()
        console.log('[oauth-exchange] User data:', JSON.stringify(userData))
        
        const broadcasterId = userData?.data?.id || userData?.id
        if (broadcasterId) {
          // Guardar tokens del cliente en el runner
          kickBotRunner.setCustomerTokens(result.accessToken, result.refreshToken, broadcasterId)
          
          // También guardar en la config de Supabase para persistencia
          const currentConfig = await getKickBotConfig()
          await setKickBotConfig({
            ...currentConfig,
            customerAccessToken: result.accessToken,
            customerRefreshToken: result.refreshToken,
            customerBroadcasterId: broadcasterId
          })
          
          console.log('[oauth-exchange] Customer tokens saved with broadcasterId:', broadcasterId)
        } else {
          console.log('[oauth-exchange] Could not get broadcasterId from user data')
        }
      } catch (userErr) {
        console.log('[oauth-exchange] Error fetching user data:', userErr.message)
      }
    }
    
    res.json(result)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Simple test endpoint for client_credentials flow (for testing only - may not have chat:write)
app.post('/api/bot/test-token', async (req, res) => {
  try {
    const { client_id, client_secret } = req.body
    if (!client_id || !client_secret) {
      return res.status(400).json({ error: 'Missing client_id or client_secret' })
    }
    
    const response = await fetch('https://id.kick.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id,
        client_secret,
      }).toString()
    })
    
    const data = await response.json()
    if (!response.ok) {
      return res.status(400).json({ error: data.error || 'failed', details: data })
    }
    
    res.json({ 
      ok: true, 
      accessToken: data.access_token,
      expiresIn: data.expires_in,
      note: 'This is an App Access Token - may not have chat:write scope'
    })
  } catch (error) {
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

app.get('/api/audio-volume', async (_req, res) => {
  try {
    const volume = await getAudioVolume()
    res.json({ volume })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

app.post('/api/audio-volume', (req, res) => {
  const volume = setAudioVolume(req.body?.volume)
  res.json({ ok: true, volume })
})

app.get('/audio/:id', (req, res) => {
  const filePath = resolve(__dirname, `../audio_cache/${req.params.id}.mp3`)
  if (!existsSync(filePath)) return res.status(404).json({ error: 'not found' })
  res.sendFile(filePath)
})

app.get('/overlay', (_req, res) => {
  const filePath = resolve(__dirname, '../public/overlay.html')
  res.type('html').sendFile(filePath)
})

app.get('/panel', (_req, res) => {
  const filePath = resolve(__dirname, '../public/panel.html')
  console.log('[panel] serving file from:', filePath)
  res.type('html').sendFile(filePath)
})

app.get('/oauth-setup', (_req, res) => {
  const filePath = resolve(__dirname, '../public/oauth-setup.html')
  console.log('[oauth-setup] serving file from:', filePath)
  res.type('html').sendFile(filePath)
})

// OAuth callback handler - processes the authorization code
app.get('/oauth/callback', (req, res) => {
  const { code, error, state } = req.query
  
  if (error) {
    return res.redirect(`/oauth-setup?error=${error}`)
  }
  
  if (code) {
    // Extract code_verifier from state (format: state:verifier)
    let codeVerifier = null
    if (state && state.includes(':')) {
      try {
        const decoded = Buffer.from(state, 'base64').toString()
        const parts = decoded.split(':')
        if (parts.length === 2) {
          codeVerifier = parts[1]
          console.log('[oauth/callback] Extracted code_verifier from state')
        }
      } catch (e) {
        console.log('[oauth/callback] Failed to extract verifier from state:', e.message)
      }
    }
    
    return res.redirect(`/oauth-setup?code=${code}&verifier=${codeVerifier || ''}`)
  }
  
  res.redirect('/oauth-setup')
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

    // Agregar listener para enviar TTS al chat del cliente cuando esté listo
    const originalBroadcast = broadcast
    broadcast = function(event) {
      // Primero ejecutar el broadcast original
      originalBroadcast(event)
      
      // Cuando un mensaje TTS está por reproducirse, enviarlo al chat del cliente
      if (event.type === 'message:start' && event.text) {
        const text = event.text
        
        // Solo enviar si hay un cliente configurado
        const botRunner = kickBotRunnerRef
        const customerTokens = botRunner?.getCustomerTokens?.() || {}
        
        if (customerTokens.broadcasterId && customerTokens.accessToken) {
          console.log('[TTS->Chat] Sending to customer channel:', text.substring(0, 50), 'broadcasterId:', customerTokens.broadcasterId)
          
          botRunner.sendChatMessageAsUser(text).then(result => {
            if (result.ok) {
              console.log('[TTS->Chat] Message sent to customer:', result.messageId)
            } else {
              console.log('[TTS->Chat] Failed:', result.error)
            }
          }).catch(err => {
            console.log('[TTS->Chat] Exception:', err.message)
          })
        } else {
          console.log('[TTS->Chat] No customer configured, skipping')
        }
      }
    }
  } catch (error) {
    console.error('❌ Error creando WebSocketServer:', error)
  }
})

void kickBotRunner.start().catch(error => {
  updateBotRuntime({ connected: false, lastError: error.message })
  console.error('[kick-bot] failed to start:', error)
})

// Al iniciar, cargar y desencriptar tokens del cliente desde Supabase
async function loadCustomerTokensOnStartup() {
  try {
    const config = await getKickBotConfig()
    if (config.customerAccessToken) {
      // Desencriptar refresh_token si está encriptado
      let refreshToken = config.customerRefreshToken
      if (refreshToken && isEncrypted(refreshToken)) {
        refreshToken = decrypt(refreshToken)
        console.log('[loadCustomerTokens] Refresh token decrypted')
      }
      
      // Cargar en el runner
      kickBotRunner.setCustomerTokens(
        config.customerAccessToken,
        refreshToken,
        config.customerBroadcasterId
      )
      console.log('[loadCustomerTokens] Customer tokens loaded, broadcasterId:', config.customerBroadcasterId)
    }
  } catch (error) {
    console.error('[loadCustomerTokens] Error:', error.message)
  }
}

// Ejecutar carga de tokens al iniciar
loadCustomerTokensOnStartup()
