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

  function buildSubscribeMessage(chatroomId) {
    return JSON.stringify({
      event: 'pusher:subscribe',
      data: { channel: `chatrooms.${chatroomId}.v2` }
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

    // Los IDs que nos dio el usuario
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
      logger.log(`[kick-bot] connecting to chatroom ${chatroomId} (${channel})...`)

      ws = new WebSocket(WEBSOCKET_URL)

      ws.onopen = () => {
        logger.log('[kick-bot] WS connected, subscribing...')
        ws.send(buildSubscribeMessage(chatroomId))
      }

      ws.onmessage = async (event) => {
        const parsed = parsePusherMessage(event.data)
        if (!parsed) return

        if (parsed.type === 'ChatMessage') {
          const message = parsed.data
          const content = message.content || ''
          const username = message.sender?.username || message.user?.username || 'unknown'

          // Debug log
          logger.log(`[kick-bot] received: "${content}" from @${username}`)

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
              role: inferRole(message),
              content,
              raw: message
            })
          } catch (error) {
            updateBotRuntime({ lastError: error.message })
            logger.error?.('[kick-bot] chat handler error', error)
          }
        }
      }

      ws.onerror = (error) => {
        updateBotRuntime({ connected: false, lastError: String(error) })
        logger.error?.('[kick-bot] WS error', error)
      }

      ws.onclose = () => {
        updateBotRuntime({ connected: false, lastSeenAt: Date.now() })
        logger.log('[kick-bot] WS disconnected')
        started = false
      }

      // Esperar a que conecte (timeout 10s)
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('connection timeout')), 10000)
        ws.onopen = () => {
          clearTimeout(timeout)
          started = true
          updateBotRuntime({ connected: true, lastSeenAt: Date.now(), lastError: null })
          logger.log(`[kick-bot] connected to #${channel}`)
          resolve()
        }
      })

      return { started: true, channel, chatroomId }
    } catch (error) {
      updateBotRuntime({ connected: false, lastError: error.message })
      logger.error?.('[kick-bot] failed to start:', error)
      return { started: false, reason: 'connection-failed' }
    }
  }

  function inferRole(message) {
    const senderUsername = String(message.sender?.username || message.user?.username || '').toLowerCase()
    if (senderUsername === 'alvaftw') {
      return 'superuser'
    }

    const flags = [
      message.sender?.is_streamer,
      message.sender?.isOwner,
      message.sender?.is_owner,
      message.sender?.is_moderator,
      message.sender?.isModerator,
      message.sender?.role
    ]

    if (flags.some(Boolean)) {
      const role = String(message.sender?.role ?? '').toLowerCase()
      if (role.includes('mod')) return 'moderator'
      if (role.includes('owner') || role.includes('streamer')) return 'streamer'
      if (message.sender?.is_streamer || message.sender?.isOwner || message.sender?.is_owner) return 'streamer'
      if (message.sender?.is_moderator || message.sender?.isModerator) return 'moderator'
      if (role.includes('vip') || message.sender?.is_vip || message.sender?.isVip) return 'vip'
    }

    return 'viewer'
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

  return {
    start,
    stop,
    isStarted: () => started,
    getClient: () => ws,
    sendChatMessage
  }
}