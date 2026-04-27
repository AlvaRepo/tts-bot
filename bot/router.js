// =============================
// Router: Parse → Validate → Delegate
// =============================

import { parseBotCommand } from './parser.js'
import { canUseCommand, normalizeRole } from './permissions.js'
import { commandHandlers } from './commands/index.js'

function createReply(sendChatMessage) {
  return async function reply(text) {
    if (typeof sendChatMessage === 'function' && text) {
      return sendChatMessage(text)
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

    const role = normalizeRole(event.role)
    const allowed = canUseCommand({
      role: event.role,
      username: event.username,
      command: parsed.command,
      config
    })

    console.log(`[router] "${parsed.command}" role=${role} allowed=${allowed}`)

    if (!allowed) {
      return { handled: true, denied: true, action: parsed.command }
    }

    const handler = commandHandlers[parsed.command]
    if (!handler) {
      return { handled: true, error: 'unknown command', action: parsed.command }
    }

    const reply = createReply(sendChatMessage)
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