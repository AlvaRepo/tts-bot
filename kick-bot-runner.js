import { KickWebSocket } from 'kick-wss'

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
  let kickWS = null
  let started = false
  let channel = null

  async function start() {
    const config = getKickBotConfig()
    const envEnabled = toBool(process.env.KICK_BOT_ENABLED)
    const enabled = config.enabled || envEnabled
    channel = (process.env.KICK_BOT_CHANNEL ?? config.channel ?? '').trim().replace(/^#/, '')

    if (!enabled) {
      updateBotRuntime({ connected: false, lastError: null })
      return { started: false, reason: 'disabled' }
    }

    if (!channel) {
      updateBotRuntime({ connected: false, lastError: 'missing KICK_BOT_CHANNEL' })
      return { started: false, reason: 'missing-env' }
    }

    try {
      kickWS = new KickWebSocket({ debug: false })

      kickWS.on('Connect', () => {
        started = true
        updateBotRuntime({ connected: true, lastSeenAt: Date.now(), lastError: null })
        logger.log(`[kick-bot] connected to #${channel}`)
      })

      kickWS.on('ChatMessage', async (message) => {
        try {
          const content = message.content || message.message?.content || ''
          const username = message.sender?.username || message.user?.username || 'unknown'

          updateBotRuntime({
            connected: true,
            lastSeenAt: Date.now(),
            lastEventAt: Date.now(),
            lastChannel: channel,
            lastUser: username,
            lastContent: content
          })

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
      })

      kickWS.on('Error', (error) => {
        updateBotRuntime({ connected: false, lastError: String(error) })
        logger.error?.('[kick-bot] websocket error', error)
      })

      kickWS.on('Disconnect', () => {
        updateBotRuntime({ connected: false, lastSeenAt: Date.now() })
        logger.log('[kick-bot] disconnected')
      })

      await kickWS.connect(channel)

      updateBotRuntime({ connected: true, lastSeenAt: Date.now(), lastError: null })
      return { started: true, channel }
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
      kickWS?.disconnect?.()
    } catch {}
    started = false
    kickWS = null
    updateBotRuntime({ connected: false })
    return { stopped: true }
  }

  async function sendChatMessage(text) {
    // kick-wss es solo lectura, no puede enviar mensajes
    // Para envío se necesitaría la API de Kick con auth
    return { ok: false, error: 'sendMessage not supported with kick-wss (read-only)' }
  }

  return {
    start,
    stop,
    isStarted: () => started,
    getClient: () => kickWS,
    sendChatMessage
  }
}