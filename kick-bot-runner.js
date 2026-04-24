// Kick bot usando WebSocket nativo - no requiere API externa

function toBool(value) {
  if (typeof value === 'boolean') return value
  if (typeof value === 'string') return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase())
  return false
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
    // WebSocket nativo no puede enviar mensajes (solo recibe)
    return { ok: false, error: 'sendMessage not supported (read-only)' }
  }

  function inferRole(message) {
    const senderUsername = String(message.sender?.username || message.user?.username || '').toLowerCase()
    if (senderUsername === 'alvaftw') return 'superuser'
    
    const badges = message.sender?.identity?.badges || []
    const badgeTypes = badges.map(badge => 
      badge.type?.toLowerCase() || badge.text?.toLowerCase() || ''
    ).filter(Boolean)
    
    // Priority: VIP > moderator > subscriber > viewer
    if (badgeTypes.includes('vip')) return 'vip'
    if (badgeTypes.includes('moderator') || badgeTypes.includes('mod')) return 'moderator'
    if (badgeTypes.includes('subscriber')) return 'subscriber'
    
    return 'viewer'
  }

  return {
    start,
    stop,
    isStarted: () => started,
    getClient: () => ws,
    sendChatMessage
  }
}