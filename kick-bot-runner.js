import { WebSocketConnection } from "kick_live_ws"

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
  let connection = null
  let started = false
  
  async function start() {
    const config = getKickBotConfig()
    const envEnabled = toBool(process.env.KICK_BOT_ENABLED)
    const enabled = config.enabled || envEnabled
    
    if (!enabled) {
      updateBotRuntime({ connected: false, lastError: null })
      return { started: false, reason: 'disabled' }
    }
    
    try {
      // Usar los IDs proporcionados por el usuario
      connection = new WebSocketConnection({
        name: "srtavodka",
        chatroom_id: 5509024,
        channel_id: 5538457
      })
       
      connection.connect()
       
      // Escuchar mensajes de chat (usar string 'chat' en lugar de MessageEvents)
      connection.on('chat', (data) => {
        try {
          const username = data?.username || data?.sender?.username || 'unknown'
          const content = data?.content || ''
           
          updateBotRuntime({
            connected: true,
            lastSeenAt: Date.now(),
            lastEventAt: Date.now(),
            lastChannel: "srtavodka",
            lastUser: username,
            lastContent: content,
            lastError: null
          })
           
          // Pasar el evento al router
          handleChatEvent({
            platform: 'kick',
            channel: "srtavodka",
            username: username,
            role: data?.sender?.role || 'viewer',
            content: content,
            raw: data
          })
        } catch (error) {
          updateBotRuntime({ lastError: error.message })
          logger.error?.('[kick-bot] chat handler error', error)
        }
      })
       
      // Manejar errores de conexión
      connection.on('error', (error) => {
        updateBotRuntime({ connected: false, lastError: error?.message || String(error) })
        logger.error?.('[kick-bot] connection error', error)
      })
       
      connection.on('disconnect', () => {
        updateBotRuntime({ connected: false })
        logger.log?.('[kick-bot] disconnected')
      })
       
      started = true
      updateBotRuntime({ connected: true, lastSeenAt: Date.now(), lastError: null })
      logger.log?.('[kick-bot] connected to #srtavodka')
       
      return { started: true, channel: "srtavodka" }
    } catch (error) {
      updateBotRuntime({ connected: false, lastError: error.message })
      logger.error?.('[kick-bot] failed to start:', error)
      return { started: false, reason: 'connection-failed' }
    }
  }
  
  async function stop() {
    try {
      if (connection) {
        connection.close?.()
        connection = null
      }
    } catch {}
    started = false
    updateBotRuntime({ connected: false })
    return { stopped: true }
  }
  
  async function sendChatMessage(text) {
    try {
      if (connection && text) {
        return { ok: false, error: 'sendMessage not available in kick_live_ws' }
      }
      return { ok: false, error: 'not connected' }
    } catch (error) {
      return { ok: false, error: error.message }
    }
  }
  
  return {
    start,
    stop,
    isStarted: () => started,
    getClient: () => connection,
    sendChatMessage
  }
}
