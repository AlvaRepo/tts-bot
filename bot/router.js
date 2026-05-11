// =============================
// Router: Parse → Validate → Delegate
// =============================

import { parseBotCommand } from './parser.js'
import { canUseCommand } from './permissions.js'
import { commandHandlers, voiceHandlers } from './commands/index.js'

function resolveCommand(command) {
  const value = String(command ?? '').trim().toLowerCase()
  if (!value) return { handler: '', permission: '' }

  if (value.startsWith('ttsvoice') && value.length > 8) {
    return { handler: value.slice(8), permission: 'voice' }
  }

  if (value.startsWith('voice') && value.length > 5) {
    return { handler: value.slice(5), permission: 'voice' }
  }

  if (Object.prototype.hasOwnProperty.call(voiceHandlers, value)) {
    return { handler: value, permission: 'voice' }
  }

  return { handler: value, permission: value }
}

function createReply(sendChatMessage) {
  return async function reply(text) {
    console.log('[reply] called, text:', text, 'sendChatMessage type:', typeof sendChatMessage)
    if (typeof sendChatMessage === 'function' && text) {
      console.log('[reply] calling sendChatMessage')
      const result = await sendChatMessage(text)
      console.log('[reply] sendChatMessage result:', JSON.stringify(result))
      return result
    }
    console.log('[reply] skipped')
  }
}

export function createRouter(deps) {
  const { getConfig, updateRuntime, sendChatMessage, ...commandDeps } = deps

  async function handleEvent(event) {
    const config = await getConfig()
    const prefix = config.prefix ?? '!'
    const parsed = parseBotCommand(event.content ?? event.text ?? '', prefix)

    updateRuntime?.({
      lastEventAt: Date.now(),
      lastUser: event.username ?? '',
      lastContent: event.content ?? ''
    })

    if (!parsed) {
      return { handled: false, ignored: true }
    }

    const resolved = resolveCommand(parsed.command)

    const allowed = canUseCommand({
      role: event.role,
      username: event.username,
       command: resolved.permission,
       config
     })

    if (!allowed) {
      return { handled: true, denied: true, action: parsed.command }
    }

    const handler = commandHandlers[resolved.handler]
    if (!handler) {
      return { handled: true, error: 'unknown command', action: parsed.command }
    }

    const reply = createReply(sendChatMessage)
    console.log('[router] reply fn exists:', typeof reply === 'function', 'sendChatMessage:', typeof sendChatMessage)
    return handler({
      event,
      parsed,
      config,
      reply,
      ...commandDeps
    })
  }

  return { handleEvent }
}
