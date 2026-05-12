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

export function createReply(sendChatMessage, updateRuntime) {
  return async function reply(text) {
    if (typeof sendChatMessage === 'function' && text) {
      try {
        const result = await sendChatMessage(text)
        if (result?.ok === false) {
          const message = result.error || 'send failed'
          updateRuntime?.({ lastError: message })
          throw new Error(message)
        }
        return result
      } catch (error) {
        const message = error?.message ?? String(error)
        updateRuntime?.({ lastError: message })
        throw error instanceof Error ? error : new Error(message)
      }
    }
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

    const reply = createReply(sendChatMessage, updateRuntime)
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
