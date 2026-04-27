// Kick bot usando WebSocket nativo - versión limpia

function toBool(value) {
  if (typeof value === 'boolean') return value
  if (typeof value === 'string') return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase())
  return false
}

function sanitizeMessage(text) {
  if (!text) return ''
  return text
    .replace(/\n/g, ' ')
    .replace(/[^\x00-\x7F]/g, '')
    .substring(0, 300)
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
  const hash = await sha256(Buffer.from(verifier))
  return base64URLEncode(hash)
}

function buildSendChatRequest(text, bearerToken, broadcasterUserId) {
  const sanitizedText = sanitizeMessage(text)
  const body = { content: sanitizedText, type: 'bot' }
  if (broadcasterUserId) {
    body.broadcaster_user_id = parseInt(broadcasterUserId, 10)
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

function buildSendChatRequestAsUser(text, bearerToken, broadcasterUserId) {
  const sanitizedText = sanitizeMessage(text)
  // Tipo "user" requiere broadcaster_user_id
  const body = { 
    content: sanitizedText, 
    type: 'user',
    broadcaster_user_id: parseInt(broadcasterUserId, 10)
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

// OAuth helpers
function buildOAuthUrl(clientId, redirectUri, scope, state, codeChallenge) {
  const url = new URL(`${KICK_OAUTH_BASE}/oauth/authorize`)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('client_id', clientId)
  url.searchParams.set('redirect_uri', redirectUri)
  url.searchParams.set('scope', scope)
  url.searchParams.set('state', state)
  url.searchParams.set('code_challenge', codeChallenge)
  url.searchParams.set('code_challenge_method', 'S256')
  return url.toString()
}

async function exchangeCodeForToken(code, clientId, clientSecret, redirectUri, codeVerifier) {
  // IMPORTANT: redirect_uri must be sent as-is, NOT URL-encoded
  const body = new URLSearchParams()
  body.set('grant_type', 'authorization_code')
  body.set('client_id', clientId)
  body.set('client_secret', clientSecret)
  body.set('redirect_uri', redirectUri)  // NOT encoded - per Kick docs
  body.set('code', code)
  if (codeVerifier) {
    body.set('code_verifier', codeVerifier)
  }

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
  sendChatMessage: sendChatMessageFromOutside,
  onCustomerTokensRefreshed = null, // Callback para guardar tokens actualizados
  logger = console
}) {
  let ws = null
  let started = false
  let channel = null
  let chatroomId = null

  // Load OAuth credentials from env
  const OAUTH_CLIENT_ID = process.env.KICK_OAUTH_CLIENT_ID
  const OAUTH_CLIENT_SECRET = process.env.KICK_OAUTH_CLIENT_SECRET
  const OAUTH_REDIRECT_URI = process.env.KICK_OAUTH_REDIRECT_URI || `https://${process.env.RENDER_EXTERNAL_URL || 'tts-bot-alva.onrender.com'}/oauth/callback`
  const BEARER_TOKEN = process.env.KICK_BOT_BEARER
  const REFRESH_TOKEN_ENV = process.env.KICK_BOT_REFRESH_TOKEN
  const BROADCASTER_USER_ID = process.env.KICK_CHANNEL_ID
  
  // OAuth tokens - load from env if available (for persistence across restarts)
  let accessToken = BEARER_TOKEN || null
  let refreshTokenValue = REFRESH_TOKEN_ENV || null
  let lastCodeVerifier = null  // Store codeVerifier for OAuth resilience

  // Customer OAuth tokens (for sending TTS to customer's channel)
  let customerAccessToken = null
  let customerRefreshToken = null
  let customerBroadcasterId = null

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

  function inferRole(message) {
    let badges = []
    
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
    
    const badgeTypes = badges.map(badge => {
      if (badge?.type) return String(badge.type).toLowerCase()
      if (badge?.text) return String(badge.text).toLowerCase()
      if (badge?.label) return String(badge.label).toLowerCase()
      if (typeof badge === 'string') return badge.toLowerCase()
      if (badge && typeof badge === 'object') {
        for (const key in badge) {
          if (typeof badge[key] === 'string' && badge[key].trim().length > 0) {
            return badge[key].toLowerCase()
          }
        }
      }
      return ''
    }).filter(Boolean)
    
    if (badgeTypes.some(b => b.includes('vip'))) return 'vip'
    if (badgeTypes.some(b => b.includes('moderator') || b.includes('mod'))) return 'moderator'
    if (badgeTypes.some(b => b.includes('subscriber'))) return 'subscriber'
    return 'viewer'
  }

  async function start() {
    const config = getKickBotConfig()
    const envEnabled = toBool(process.env.KICK_BOT_ENABLED)
    const enabled = config.enabled || envEnabled
    channel = (process.env.KICK_BOT_CHANNEL ?? config.channel ?? '').trim().replace(/^#/, '')

    const envChatroomId = parseInt(process.env.KICK_CHATROOM_ID ?? '', 10)
    chatroomId = envChatroomId || config.chatroomId || null

    // Load customer OAuth tokens from config
    customerAccessToken = config.customerAccessToken || null
    customerRefreshToken = config.customerRefreshToken || null
    customerBroadcasterId = config.customerBroadcasterId || null

    console.log('[start] Customer tokens loaded:', { 
      hasAccessToken: !!customerAccessToken, 
      customerBroadcasterId 
    })

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

      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('connection timeout')), 10000)
        
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
    console.log('[sendChat] === START ===')
    console.log('[sendChat] text:', text)
    console.log('[sendChat] started:', started)
    if (!text || !started) {
      console.log('[sendChat] early return - no text or not started')
      return { ok: false, error: 'not connected' }
    }

    const config = getKickBotConfig()
    const token = accessToken || BEARER_TOKEN || config.sessionToken
    console.log('[sendChat] has token:', !!token, 'token prefix:', token?.substring(0, 10))
    if (!token) {
      console.log('[sendChat] no token')
      return { ok: false, error: 'no access token' }
    }

    const broadcasterId = BROADCASTER_USER_ID || null
    console.log('[sendChat] broadcasterId:', broadcasterId)

    try {
      const requestOpts = buildSendChatRequest(text, token, broadcasterId)
      console.log('[sendChat] request body:', requestOpts.body)
      const response = await fetch(`${KICK_API_BASE}/public/v1/chat`, requestOpts)
      const result = await response.json()
      console.log('[sendChat] status:', response.status, 'result:', JSON.stringify(result))

      if (response.status === 401 && refreshTokenValue) {
        console.log('[sendChat] 401, trying refresh...')
        const refreshed = await refreshToken(refreshTokenValue, OAUTH_CLIENT_ID, OAUTH_CLIENT_SECRET)
        if (refreshed.access_token) {
          accessToken = refreshed.access_token
          refreshTokenValue = refreshed.refresh_token
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
      console.log('[sendChat] exception:', error.message)
      return { ok: false, error: error.message }
    }
  }

  // Expose OAuth helper methods
  async function getOAuthUrl() {
    if (!OAUTH_CLIENT_ID) return null
    const state = Math.random().toString(36).substring(2)
    const codeVerifier = generateCodeVerifier()
    const codeChallenge = await generateCodeChallengeFromVerifier(codeVerifier)
    
    // Store for resilience if user reloads page
    lastCodeVerifier = codeVerifier
    
    const scopes = 'user:read channel:read chat:write'
    const url = buildOAuthUrl(OAUTH_CLIENT_ID, OAUTH_REDIRECT_URI, scopes, state, codeChallenge)
    
    return {
      url,
      codeVerifier,
      state
    }
  }

  async function exchangeCode(code, codeVerifier) {
    if (!OAUTH_CLIENT_ID || !OAUTH_CLIENT_SECRET) {
      return { ok: false, error: 'OAuth not configured' }
    }

    // Use provided codeVerifier, or fall back to the last stored one
    const verifier = codeVerifier || lastCodeVerifier
    if (!verifier) {
      return { ok: false, error: 'No code_verifier available. Please start OAuth flow again.' }
    }

    const result = await exchangeCodeForToken(code, OAUTH_CLIENT_ID, OAUTH_CLIENT_SECRET, OAUTH_REDIRECT_URI, verifier)
    if (result.access_token) {
      accessToken = result.access_token
      refreshTokenValue = result.refresh_token
      return { ok: true, accessToken: result.access_token, refreshToken: result.refresh_token }
    }
    return { ok: false, error: result.message || 'exchange failed' }
  }

  // Variable para el codeVerifier del cliente
  let lastCustomerCodeVerifier = null

  // Generar URL de OAuth para que el cliente conecte su cuenta
  async function getCustomerOAuthUrl() {
    if (!OAUTH_CLIENT_ID) return null
    const state = Math.random().toString(36).substring(2)
    const codeVerifier = generateCodeVerifier()
    const codeChallenge = await generateCodeChallengeFromVerifier(codeVerifier)
    
    // Guardar codeVerifier para el callback
    lastCustomerCodeVerifier = codeVerifier
    
    // Usar redirect_uri específico para clientes
    const customerRedirectUri = process.env.KICK_OAUTH_CUSTOMER_REDIRECT_URI || `${OAUTH_REDIRECT_URI.replace('/oauth/callback', '/oauth/customer-callback')}`
    const scopes = 'user:read channel:read chat:write'
    const url = buildOAuthUrl(OAUTH_CLIENT_ID, customerRedirectUri, scopes, state, codeChallenge)
    
    console.log('[getCustomerOAuthUrl] redirect_uri:', customerRedirectUri)
    
    return {
      url,
      codeVerifier,
      state
    }
  }

  // Intercambiar code por tokens para el cliente
  async function exchangeCustomerCode(code, codeVerifier) {
    if (!OAUTH_CLIENT_ID || !OAUTH_CLIENT_SECRET) {
      return { ok: false, error: 'OAuth not configured' }
    }

    const verifier = codeVerifier || lastCustomerCodeVerifier
    if (!verifier) {
      return { ok: false, error: 'No code_verifier available. Please start OAuth flow again.' }
    }

    // Usar redirect_uri específico para clientes
    const customerRedirectUri = process.env.KICK_OAUTH_CUSTOMER_REDIRECT_URI || `${OAUTH_REDIRECT_URI.replace('/oauth/callback', '/oauth/customer-callback')}`
    
    const result = await exchangeCodeForToken(code, OAUTH_CLIENT_ID, OAUTH_CLIENT_SECRET, customerRedirectUri, verifier)
    
    if (result.access_token) {
      // Obtener el broadcaster_id, username y chatroom_id del cliente
      let broadcasterId = null
      let username = null
      let chatroomId = null
      try {
        const userRes = await fetch(`${KICK_API_BASE}/public/v1/users/me`, {
          headers: { 'Authorization': `Bearer ${result.access_token}` }
        })
        const userData = await userRes.json()
        broadcasterId = userData?.data?.id || userData?.id
        username = userData?.data?.username || userData?.username
        // Obtener chatroom_id para escribir en el chat del cliente
        chatroomId = userData?.data?.chatroom?.id || userData?.chatroom?.id || null
        console.log('[exchangeCustomerCode] Customer:', { broadcasterId, username, chatroomId })
      } catch (e) {
        console.log('[exchangeCustomerCode] Failed to get user data:', e.message)
      }
      
      // Guardar tokens del cliente
      customerAccessToken = result.access_token
      customerRefreshToken = result.refresh_token
      customerBroadcasterId = broadcasterId
      
      return { 
        ok: true, 
        accessToken: result.access_token, 
        refreshToken: result.refresh_token,
        broadcasterId,
        username,
        chatroomId
      }
    }
    return { ok: false, error: result.message || 'exchange failed' }
  }

  // Guardar tokens del cliente (cuando completa OAuth)
  function setCustomerTokens(accessTokenValue, refreshTokenValue, broadcasterId) {
    customerAccessToken = accessTokenValue
    customerRefreshToken = refreshTokenValue
    customerBroadcasterId = broadcasterId
    console.log('[setCustomerTokens] Customer tokens set:', { 
      hasAccessToken: !!customerAccessToken, 
      customerBroadcasterId 
    })
  }

  // Obtener el estado de los tokens del cliente (para persistirlos)
  function getCustomerTokens() {
    return {
      accessToken: customerAccessToken,
      refreshToken: customerRefreshToken,
      broadcasterId: customerBroadcasterId
    }
  }

  // Enviar mensaje como el usuario (no como bot)
  async function sendChatMessageAsUser(text) {
    console.log('[sendChatAsUser] === START ===')
    console.log('[sendChatAsUser] text:', text)
    console.log('[sendChatAsUser] has customerAccessToken:', !!customerAccessToken)
    console.log('[sendChatAsUser] customerBroadcasterId:', customerBroadcasterId)
    
    if (!text || !customerAccessToken || !customerBroadcasterId) {
      console.log('[sendChatAsUser] early return - missing params')
      return { ok: false, error: 'Customer not authenticated or missing broadcaster_id' }
    }

    try {
      // Usar tipo "user" con broadcaster_user_id del cliente
      const requestOpts = buildSendChatRequestAsUser(text, customerAccessToken, customerBroadcasterId)
      console.log('[sendChatAsUser] request body:', requestOpts.body)
      
      const response = await fetch(`${KICK_API_BASE}/public/v1/chat`, requestOpts)
      const result = await response.json()
      console.log('[sendChatAsUser] status:', response.status, 'result:', JSON.stringify(result))

      // Manejar refresh token del cliente
      if (response.status === 401 && customerRefreshToken) {
        console.log('[sendChatAsUser] 401, refreshing customer token...')
        const refreshed = await refreshToken(customerRefreshToken, OAUTH_CLIENT_ID, OAUTH_CLIENT_SECRET)
        if (refreshed.access_token) {
          customerAccessToken = refreshed.access_token
          customerRefreshToken = refreshed.refresh_token
          
          // Guardar tokens actualizados en Supabase (encriptados)
          if (onCustomerTokensRefreshed) {
            onCustomerTokensRefreshed(customerAccessToken, customerRefreshToken, customerBroadcasterId)
          }
          
          const retryResponse = await fetch(`${KICK_API_BASE}/public/v1/chat`, 
            buildSendChatRequestAsUser(text, customerAccessToken, customerBroadcasterId))
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
      console.log('[sendChatAsUser] exception:', error.message)
      return { ok: false, error: error.message }
    }
  }

  return {
    start,
    stop,
    isStarted: () => started,
    getClient: () => ws,
    sendChatMessage,
    sendChatMessageAsUser,
    getOAuthUrl,
    exchangeCode,
    // Customer OAuth
    getCustomerOAuthUrl,
    exchangeCustomerCode,
    setCustomerTokens,
    getCustomerTokens
  }
}
