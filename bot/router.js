// =============================
// Router: Parse → Validate → Delegate
// =============================

import { parseBotCommand } from './parser.js'
import { canUseCommand } from './permissions.js'
import { commandHandlers } from './commands/index.js'

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

    const allowed = canUseCommand({
      role: event.role,
      username: event.username,
      command: parsed.command,
      config
    })

    if (!allowed) {
      return { handled: true, denied: true, action: parsed.command }
    }

    const handler = commandHandlers[parsed.command]
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