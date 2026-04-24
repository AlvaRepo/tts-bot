// Kick bot usando WebSocket nativo

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
      updateBotRuntime({ connected: false, lastError: 'missing channel or chatroomId' })
      return { started: false, reason: 'missing-env' }
    }

    try {
      ws = new WebSocket(WEBSOCKET_URL)

      // Guardar el handler original para después
      let resolved = false
      ws.onopen = () => {
        // SUSCRIBIRSE AL CANAL DE CHAT
        const subMsg = buildSubscribeMessage(chatroomId)
        console.log('[kick-bot] subscribing:', subMsg)
        ws.send(subMsg)
        
        resolved = true
        started = true
        updateBotRuntime({ connected: true, lastSeenAt: Date.now(), lastError: null })
        console.log('[kick-bot] connected to chatroom:', chatroomId)
      }

      ws.onmessage = async (event) => {
        const parsed = parsePusherMessage(event.data)
        if (!parsed || parsed.type !== 'ChatMessage') return

        const message = parsed.data
        const content = (message.content || '').trim()
        const username = message.sender?.username || message.user?.username || 'unknown'
        const role = inferRole(message)

        console.log('[kick-bot] msg:', content.slice(0, 50), '@', username, 'role:', role)

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
        console.log('[kick-bot] error:', error)
      }

      ws.onclose = () => {
        console.log('[kick-bot] disconnected')
        started = false
        updateBotRuntime({ connected: false })
      }

      // Esperar conexión (timeout 10s)
      await new Promise((resolve, reject) => {
        setTimeout(() => {
          if (!resolved) reject(new Error('timeout'))
        }, 10000)
      })

      return { started: true, channel, chatroomId }
    } catch (error) {
      updateBotRuntime({ connected: false, lastError: error.message })
      console.log('[kick-bot] failed:', error.message)
      return { started: false, reason: 'error' }
    }
  }

  function inferRole(message) {
    const senderUsername = String(message.sender?.username || message.user?.username || '').toLowerCase()
    if (senderUsername === 'alvaftw') return 'superuser'
    
    const flags = [
      message.sender?.is_streamer,
      message.sender?.isOwner,
      message.sender?.is_moderator,
      message.sender?.role
    ]

    if (flags.some(Boolean)) {
      const role = String(message.sender?.role ?? '').toLowerCase()
      if (role.includes('mod')) return 'moderator'
      if (role.includes('owner') || role.includes('streamer')) return 'streamer'
      if (role.includes('vip') || message.sender?.is_vip) return 'vip'
    }

    return 'viewer'
  }

  async function stop() {
    ws?.close()
    started = false
    ws = null
    updateBotRuntime({ connected: false })
    return { stopped: true }
  }

  async function sendChatMessage(text) {
    return { ok: false, error: 'not supported' }
  }

  return {
    start,
    stop,
    isStarted: () => started,
    getClient: () => ws,
    sendChatMessage
  }
}