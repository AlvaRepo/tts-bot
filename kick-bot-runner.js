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

function buildSendChatRequest(text, bearerToken) {
  return {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${bearerToken}`
    },
    body: JSON.stringify({
      content: text,
      type: 'bot'
    })
  }
}

// OAuth helpers - use space-separated scopes, URL encoded
function buildOAuthUrl(clientId, redirectUri, scope, state, codeChallenge) {
  // Encode each parameter properly
  const scopeEncoded = encodeURIComponent(scope)
  const redirectUriEncoded = encodeURIComponent(redirectUri)
  
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUriEncoded,
    scope: scopeEncoded,
    state: state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256'
  })
  return `${KICK_OAUTH_BASE}/oauth/authorize?${params.toString()}`
}

async function exchangeCodeForToken(code, clientId, clientSecret, redirectUri, codeVerifier) {
  const params = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    code,
    code_verifier: codeVerifier
  })

  const response = await fetch(`${KICK_OAUTH_BASE}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString()
  })

  return response.json()
}

async function refreshToken(refreshToken, clientId, clientSecret) {
  const params = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken
  })

  const response = await fetch(`${KICK_OAUTH_BASE}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString()
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

  // Load OAuth credentials from env
  const OAUTH_CLIENT_ID = process.env.KICK_OAUTH_CLIENT_ID
  const OAUTH_CLIENT_SECRET = process.env.KICK_OAUTH_CLIENT_SECRET
  const OAUTH_REDIRECT_URI = process.env.KICK_OAUTH_REDIRECT_URI || `https://${process.env.RENDER_EXTERNAL_URL || 'tts-bot-alva.onrender.com'}/oauth/callback`

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
      return { ok: false, error: 'OAuth not configured' }
    }

    // Use environment token as fallback, or try OAuth
    const token = accessToken || process.env.KICK_BOT_BEARER
    if (!token) {
      return { ok: false, error: 'no access token' }
    }

    try {
      const response = await fetch(`${KICK_API_BASE}/public/v1/chat`, buildSendChatRequest(text, token))
      const result = await response.json()

      // If unauthorized, try to refresh token
      if (response.status === 401 && refreshTokenValue) {
        const refreshed = await refreshToken(refreshTokenValue, OAUTH_CLIENT_ID, OAUTH_CLIENT_SECRET)
        if (refreshed.access_token) {
          accessToken = refreshed.access_token
          refreshTokenValue = refreshed.refresh_token
          // Retry with new token
          const retryResponse = await fetch(`${KICK_API_BASE}/public/v1/chat`, buildSendChatRequest(text, accessToken))
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
    if (!OAUTH_CLIENT_ID) return null
    const state = Math.random().toString(36).substring(2)
    const codeVerifier = generateCodeVerifier()
    const codeChallenge = await generateCodeChallengeFromVerifier(codeVerifier)
    
    // First try just user:read - simpler scope
    // If that works, can add chat:write later
    const scopes = 'user:read'
    
    return {
      url: buildOAuthUrl(OAUTH_CLIENT_ID, OAUTH_REDIRECT_URI, scopes, state, codeChallenge),
      codeVerifier,
      state
    }
  }

  async function exchangeCode(code, codeVerifier) {
    if (!OAUTH_CLIENT_ID || !OAUTH_CLIENT_SECRET) {
      return { ok: false, error: 'OAuth not configured' }
    }
    try {
      const result = await exchangeCodeForToken(code, OAUTH_CLIENT_ID, OAUTH_CLIENT_SECRET, OAUTH_REDIRECT_URI, codeVerifier)
      if (result.access_token) {
        accessToken = result.access_token
        refreshTokenValue = result.refresh_token
        return { ok: true, accessToken: result.access_token, refreshToken: result.refresh_token }
      }
      return { ok: false, error: result.message || 'exchange failed' }
    } catch (error) {
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