import { createClient } from "@retconned/kick-js"

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
  let client = null
  let started = false
  
  async function start() {
    const config = getKickBotConfig()
    const envEnabled = toBool(process.env.KICK_BOT_ENABLED)
    const enabled = config.enabled || envEnabled
    const channel = (process.env.KICK_BOT_CHANNEL ?? config.channel ?? '').trim().replace(/^#/, '')
    const bearerToken = (process.env.KICK_BOT_BEARER ?? '').trim()
    const cookies = (process.env.KICK_BOT_COOKIES ?? '').trim()
      
    if (!enabled) {
      updateBotRuntime({ connected: false, lastError: null })
      return { started: false, reason: 'disabled' }
    }
      
    if (!channel || !bearerToken || !cookies) {
      updateBotRuntime({ connected: false, lastError: 'missing Kick bot env vars' })
      return { started: false, reason: 'missing-env' }
    }
      
    try {
      client = createClient(channel, { logger: false, readOnly: false })
        
      client.on?.('ready', () => {
        started = true
        updateBotRuntime({ connected: true, lastSeenAt: Date.now(), lastError: null })
        logger.log(`[kick-bot] ready on #${channel}`)
      })
        
      client.on?.('ChatMessage', async (message) => {
        try {
          updateBotRuntime({
            connected: true,
            lastSeenAt: Date.now(),
            lastEventAt: Date.now(),
            lastChannel: channel,
            lastUser: message?.sender?.username ?? message?.sender?.displayName ?? 'unknown',
            lastContent: message?.content ?? ''
          })
            
          await handleChatEvent({
            platform: 'kick',
            channel,
            username: message?.sender?.username ?? message?.sender?.displayName ?? 'unknown',
            role: inferRole(message),
            content: message?.content ?? '',
            raw: message
          })
        } catch (error) {
          updateBotRuntime({ lastError: error.message })
          logger.error?.('[kick-bot] chat handler error', error)
        }
      })
        
      client.on?.('error', (error) => {
        updateBotRuntime({ connected: false, lastError: error?.message ?? String(error) })
        logger.error?.('[kick-bot] client error', error)
      })
        
      await client.login({
        type: 'tokens',
        credentials: {
          bearerToken,
          cookies
        }
      })
        
      updateBotRuntime({ connected: true, lastSeenAt: Date.now(), lastError: null })
      return { started: true, channel }
    } catch (error) {
      updateBotRuntime({ connected: false, lastError: error.message })
      logger.error?.('[kick-bot] failed to start:', error)
      return { started: false, reason: 'connection-failed' }
    }
  }
  
  function inferRole(message) {
    const senderUsername = String(message?.sender?.username ?? message?.sender?.displayName ?? '').toLowerCase()
    if (senderUsername === 'alvaftw') {
      return 'superuser'
    }
      
    const flags = [
      message?.sender?.is_streamer,
      message?.sender?.isOwner,
      message?.sender?.is_owner,
      message?.sender?.is_moderator,
      message?.sender?.isModerator,
      message?.sender?.role
    ]
      
    if (flags.some(Boolean)) {
      const role = String(message?.sender?.role ?? '').toLowerCase()
      if (role.includes('mod')) return 'moderator'
      if (role.includes('owner') || role.includes('streamer')) return 'streamer'
      if (message?.sender?.is_streamer || message?.sender?.isOwner || message?.sender?.is_owner) return 'streamer'
      if (message?.sender?.is_moderator || message?.sender?.isModerator) return 'moderator'
      if (role.includes('vip') || message?.sender?.is_vip || message?.sender?.isVip) return 'vip'
    }
      
    return 'viewer'
  }
  
  async function stop() {
    try {
      await client?.disconnect?.()
      await client?.logout?.()
      await client?.close?.()
    } catch {}
    started = false
    client = null
    updateBotRuntime({ connected: false })
    return { stopped: true }
  }
  
  async function sendChatMessage(text) {
    try {
      const sendMessage = client?.sendMessage
      if (typeof sendMessage === 'function') {
        await sendMessage(text)
        return { ok: true }
      }
      return { ok: false, error: 'sendMessage not available' }
    } catch (error) {
      return { ok: false, error: error.message }
    }
  }
  
  return {
    start,
    stop,
    isStarted: () => started,
    getClient: () => client,
    sendChatMessage
  }
}
