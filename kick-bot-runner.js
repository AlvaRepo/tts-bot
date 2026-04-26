// Kick bot usando WebSocket nativo - no requiere API externa

function toBool(value) {
  if (typeof value === 'boolean') return value
  if (typeof value === 'string') return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase())
  return false
}

const KICK_API_BASE = 'https://api.kick.com'
const KICK_OAUTH_BASE = 'https://id.kick.com'

// PKCE helpers
function base64URLEncode(buffer) {
  return Buffer.from(buffer)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '')
}

async function sha256(buffer) {
  const crypto = await import('crypto')
  return crypto.createHash('sha256').update(buffer).digest()
}

function generateCodeVerifier() {
  const array = new Uint8Array(32)
  crypto.getRandomValues(array)
  return base64URLEncode(array)
}

async function generateCodeChallengeFromVerifier(verifier) {
  const hash = await sha256(verifier)
  return base64URLEncode(hash)
}

function buildSendChatRequest(text, bearerToken, broadcasterUserId) {
  const body = { type: 'bot', content: text }
  // Only add broadcaster_user_id if provided (needed for type: 'user', not for 'bot')
  if (broadcasterUserId) {
    body.broadcaster_user_id = broadcasterUserId
  }
  return {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${bearerToken}`
    },
    body: JSON.stringify(body)
  }
}

// OAuth helpers - simplified, proper formatting
function buildOAuthUrl(clientId, redirectUri, scope, state, codeChallenge) {
  // URL encode the redirect_uri
  const redirectUriEncoded = encodeURIComponent(redirectUri)
  
  const url = new URL(`${KICK_OAUTH_BASE}/oauth/authorize`)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('client_id', clientId)
  url.searchParams.set('redirect_uri', redirectUriEncoded)
  url.searchParams.set('scope', scope)
  url.searchParams.set('state', state)
  url.searchParams.set('code_challenge', codeChallenge)
  url.searchParams.set('code_challenge_method', 'S256')
  
  return url.toString()
}

async function exchangeCodeForToken(code, clientId, clientSecret, redirectUri, codeVerifier) {
  // NOTE: redirectUri is already encoded from buildOAuthUrl - don't encode again!
  // Just use it as-is since it's already in percent-encoded form
  const redirectUriEncoded = redirectUri // Already encoded - no re-encoding!
  
  console.log('[OAuth] exchangeCodeForToken - redirectUri:', redirectUri)
  
  const body = new URLSearchParams()
  body.set('grant_type', 'authorization_code')
  body.set('client_id', clientId)
  body.set('client_secret', clientSecret)
  body.set('redirect_uri', redirectUriEncoded)
  body.set('code', code)
  body.set('code_verifier', codeVerifier)

  const response = await fetch(`${KICK_OAUTH_BASE}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString()
  })

  return response.json()
}

async function refreshToken(refreshTokenValue, clientId, clientSecret) {
  const body = new URLSearchParams()
  body.set('grant_type', 'refresh_token')
  body.set('client_id', clientId)
  body.set('client_secret', clientSecret)
  body.set('refresh_token', refreshTokenValue)

  const response = await fetch(`${KICK_OAUTH_BASE}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString()
  })

  return response.json()
}

export function createKickBotRunner({
  getKickBotConfig,
  setKickBotConfig,
  updateBotRuntime,
  handleChatEvent,
  logger = console
}) {
  let ws = null
  let started = false
  let channel = null
  let chatroomId = null

  // OAuth tokens (loaded from env or config)
  let accessToken = null
  let refreshTokenValue = null

  // NEW TOKEN with chat:write scope (generated after bot was activated)
  // This token was created on 2026-04-26 after fixing the issue
  const FALLBACK_ACCESS_TOKEN = 'OWRJMJU1MDUTOGIZNY0ZYWMXLTLMZGMTYZI4MJQZOTZLNWU4'
  const FALLBACK_REFRESH_TOKEN = 'NGI4ZJA5MDETYJVHYS01ZTA2LTHHZJKTMMI3ODJKNZY5NWI0'

  // Load OAuth credentials from env
  const OAUTH_CLIENT_ID = process.env.KICK_OAUTH_CLIENT_ID
  const OAUTH_CLIENT_SECRET = process.env.KICK_OAUTH_CLIENT_SECRET
  const OAUTH_REDIRECT_URI = process.env.KICK_OAUTH_REDIRECT_URI || `https://${process.env.RENDER_EXTERNAL_URL || 'tts-bot-alva.onrender.com'}/oauth/callback`
  
  console.log('[OAuth] Environment variables:')
  console.log('[OAuth] CLIENT_ID:', OAUTH_CLIENT_ID ? 'set' : 'NOT SET')
  console.log('[OAuth] CLIENT_SECRET:', OAUTH_CLIENT_SECRET ? 'set' : 'NOT SET')
  console.log('[OAuth] REDIRECT_URI:', OAUTH_REDIRECT_URI)
  const BROADCASTER_USER_ID = process.env.KICK_CHANNEL_ID

  const PUSHER_APP_KEY = '32cbd69e4b950bf97679'
  const WEBSOCKET_URL = `wss://ws-us2.pusher.com/app/${PUSHER_APP_KEY}?protocol=7&client=js&version=8.4.0`

  function buildSubscribeMessage(id) {
    return JSON.stringify({
      event: 'pusher:subscribe',
      data: { channel: `chatrooms.${id}.v2` }
    })
  }

  function parsePusherMessage(raw) {
    try {
      const msg = JSON.parse(raw)
      if (msg.event === 'pusher:error') {
        return { type: 'error', data: msg.data }
      }
      if (msg.event === 'App\\Events\\ChatMessageEvent') {
        const data = typeof msg.data === 'string' ? JSON.parse(msg.data) : msg.data
        return { type: 'ChatMessage', data }
      }
      return { type: msg.event, data: msg.data }
    } catch {
      return null
    }
  }

  async function start() {
    const config = getKickBotConfig()
    const envEnabled = toBool(process.env.KICK_BOT_ENABLED)
    const enabled = config.enabled || envEnabled
    channel = (process.env.KICK_BOT_CHANNEL ?? config.channel ?? '').trim().replace(/^#/, '')

    const envChatroomId = parseInt(process.env.KICK_CHATROOM_ID ?? '', 10)
    chatroomId = envChatroomId || config.chatroomId || null

    if (!enabled) {
      updateBotRuntime({ connected: false, lastError: null })
      return { started: false, reason: 'disabled' }
    }

    if (!channel || !chatroomId) {
      updateBotRuntime({ connected: false, lastError: 'missing KICK_BOT_CHANNEL or KICK_CHATROOM_ID' })
      return { started: false, reason: 'missing-env' }
    }

    try {
      ws = new WebSocket(WEBSOCKET_URL)

      ws.onopen = () => {
        ws.send(buildSubscribeMessage(chatroomId))
      }

      ws.onmessage = async (event) => {
        const parsed = parsePusherMessage(event.data)
        if (!parsed || parsed.type !== 'ChatMessage') return

        const message = parsed.data
        const content = (message.content || '').trim()
        const username = message.sender?.username || message.user?.username || 'unknown'
        const role = inferRole(message)

        updateBotRuntime({
          connected: true,
          lastSeenAt: Date.now(),
          lastEventAt: Date.now(),
          lastChannel: channel,
          lastUser: username,
          lastContent: content
        })

        try {
          await handleChatEvent({
            platform: 'kick',
            channel,
            username,
            role,
            content,
            raw: message
          })
        } catch (error) {
          updateBotRuntime({ lastError: error.message })
        }
      }

      ws.onerror = (error) => {
        updateBotRuntime({ connected: false, lastError: String(error) })
      }

      ws.onclose = () => {
        updateBotRuntime({ connected: false, lastSeenAt: Date.now() })
        started = false
      }

      // Esperar a que conecte (timeout 10s)
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('connection timeout')), 10000)
        
        // Sobrescribimos onopen para resolver la promesa cuando conecte
        const originalOnOpen = ws.onopen
        ws.onopen = () => {
          clearTimeout(timeout)
          if (typeof originalOnOpen === 'function') {
            originalOnOpen()
          }
          started = true
          updateBotRuntime({ connected: true, lastSeenAt: Date.now(), lastError: null })
          resolve()
        }
      })

      return { started: true, channel, chatroomId }
    } catch (error) {
      updateBotRuntime({ connected: false, lastError: error.message })
      return { started: false, reason: 'connection-failed' }
    }
  }

  async function stop() {
    try {
      ws?.close()
    } catch {}
    started = false
    ws = null
    updateBotRuntime({ connected: false })
    return { stopped: true }
  }

  async function sendChatMessage(text) {
    if (!text || !started) return { ok: false, error: 'not connected' }

    // Check if we have OAuth credentials
    if (!OAUTH_CLIENT_ID || !OAUTH_CLIENT_SECRET) {
      console.log('[sendChatMessage] OAuth not configured - missing CLIENT_ID or SECRET')
      return { ok: false, error: 'OAuth not configured' }
    }

    // Use environment token as fallback, or try OAuth
    const token = accessToken || FALLBACK_ACCESS_TOKEN || process.env.KICK_BOT_BEARER
    console.log('[sendChatMessage] Using token:', token ? token.substring(0, 20) + '...' : 'NULL')
    if (!token) {
      return { ok: false, error: 'no access token' }
    }

    // Bot type doesn't need broadcaster_user_id (only user type needs it)
    const broadcasterId = BROADCASTER_USER_ID || null

    try {
      const response = await fetch(`${KICK_API_BASE}/public/v1/chat`, buildSendChatRequest(text, token, broadcasterId))
      const result = await response.json()

      // If unauthorized, try to refresh token
      if (response.status === 401 && refreshTokenValue) {
        const refreshed = await refreshToken(refreshTokenValue, OAUTH_CLIENT_ID, OAUTH_CLIENT_SECRET)
        if (refreshed.access_token) {
          accessToken = refreshed.access_token
          refreshTokenValue = refreshed.refresh_token
          // Retry with new token
          const retryResponse = await fetch(`${KICK_API_BASE}/public/v1/chat`, buildSendChatRequest(text, accessToken, broadcasterId))
          const retryResult = await retryResponse.json()
          if (retryResponse.ok && retryResult.data?.message_id) {
            return { ok: true, messageId: retryResult.data.message_id }
          }
          return { ok: false, error: retryResult.message || 'retry failed' }
        }
      }

      if (response.ok && result.data?.message_id) {
        return { ok: true, messageId: result.data.message_id }
      }
      return { ok: false, error: result.message || 'send failed', details: result }
    } catch (error) {
      return { ok: false, error: error.message }
    }
  }

  // Expose OAuth helper methods
  async function getOAuthUrl() {
    console.log('[OAuth] getOAuthUrl called, CLIENT_ID:', OAUTH_CLIENT_ID ? 'set' : 'NOT SET')
    if (!OAUTH_CLIENT_ID) {
      console.log('[OAuth] getOAuthUrl - no CLIENT_ID')
      return null
    }
    const state = Math.random().toString(36).substring(2)
    const codeVerifier = generateCodeVerifier()
    const codeChallenge = await generateCodeChallengeFromVerifier(codeVerifier)
    
    // OAuth scopes: chat:write is REQUIRED to send messages
    const scopes = 'user:read channel:read chat:write'
    const url = buildOAuthUrl(OAUTH_CLIENT_ID, OAUTH_REDIRECT_URI, scopes, state, codeChallenge)
    console.log('[OAuth] getOAuthUrl - URL built, scopes:', scopes)
    
    return {
      url,
      codeVerifier,
      state
    }
  }

  async function exchangeCode(code, codeVerifier) {
    if (!OAUTH_CLIENT_ID || !OAUTH_CLIENT_SECRET) {
      console.log('[OAuth] exchangeCode - OAuth not configured, CLIENT_ID:', !!OAUTH_CLIENT_ID, 'SECRET:', !!OAUTH_CLIENT_SECRET)
      return { ok: false, error: 'OAuth not configured' }
    }
    try {
      console.log('[OAuth] Exchange for code:', code ? '***' : 'missing')
      console.log('[OAuth] client_id:', OAUTH_CLIENT_ID)
      console.log('[OAuth] redirect_uri:', OAUTH_REDIRECT_URI)
      console.log('[OAuth] codeVerifier:', codeVerifier ? 'set' : 'NOT SET')
      
      const result = await exchangeCodeForToken(code, OAUTH_CLIENT_ID, OAUTH_CLIENT_SECRET, OAUTH_REDIRECT_URI, codeVerifier)
      console.log('[OAuth] Token response:', JSON.stringify(result))
      if (result.access_token) {
        console.log('[OAuth] SUCCESS - got access_token:', result.access_token.substring(0, 20) + '...')
        accessToken = result.access_token
        refreshTokenValue = result.refresh_token
        return { ok: true, accessToken: result.access_token, refreshToken: result.refresh_token }
      }
      console.log('[OAuth] FAILED - no access_token in response')
      return { ok: false, error: result.message || 'exchange failed' }
    } catch (error) {
      console.log('[OAuth] exchangeCode exception:', error.message)
      return { ok: false, error: error.message }
    }
  }

function inferRole(message) {
  // Los badges determinan el rol de la plataforma
  // El superuser se determina en permissions.js usando config.superusers (no hardcodeado aquí)
  
  // Try to extract badges from multiple possible locations
  let badges = []
  
  // Common Kick badge locations
  if (message.sender?.identity?.badges) {
    badges = message.sender?.identity?.badges
  } else if (message.sender?.badges) {
    badges = message.sender?.badges
  } else if (message.user?.identity?.badges) {
    badges = message.user?.identity?.badges
  } else if (message.user?.badges) {
    badges = message.user?.badges
  } else if (message.badges) {
    badges = message.badges
  }
  
  // Extract badge identifiers with multiple fallback strategies
  const badgeTypes = badges.map(badge => {
    // Strategy 1: Check for type property
    if (badge?.type) return String(badge.type).toLowerCase()
    // Strategy 2: Check for text property  
    if (badge?.text) return String(badge.text).toLowerCase()
    // Strategy 3: Check for label property
    if (badge?.label) return String(badge.label).toLowerCase()
    // Strategy 4: Check if badge is already a string
    if (typeof badge === 'string') return badge.toLowerCase()
    // Strategy 5: Try to get any string property
    if (badge && typeof badge === 'object') {
      for (const key in badge) {
        if (typeof badge[key] === 'string' && badge[key].trim().length > 0) {
          return badge[key].toLowerCase()
        }
      }
    }
    return ''
  }).filter(Boolean)
  
  // Priority: VIP > moderator > subscriber > viewer
  if (badgeTypes.some(b => b.includes('vip'))) return 'vip'
  if (badgeTypes.some(b => b.includes('moderator') || b.includes('mod'))) return 'moderator'
  if (badgeTypes.some(b => b.includes('subscriber'))) return 'subscriber'
  
  return 'viewer'
}

  return {
    start,
    stop,
    isStarted: () => started,
    getClient: () => ws,
    sendChatMessage,
    getOAuthUrl,
    exchangeCode
  }
}