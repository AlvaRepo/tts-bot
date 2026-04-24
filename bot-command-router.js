function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeRole(value) {
  const role = normalizeText(value).toLowerCase()
  if (['streamer', 'owner'].includes(role)) return 'streamer'
  if (['moderator', 'mod'].includes(role)) return 'moderator'
  if (['vip'].includes(role)) return 'vip'
  if (['superuser'].includes(role)) return 'superuser'
  return 'viewer'
}

function normalizeCommandName(command) {
  const value = normalizeText(command).toLowerCase()
  if (value.startsWith('voice') || value.startsWith('ttsvoice')) return 'voice'
  return value
}

export function parseBotCommand(text, prefix = '!') {
  const raw = normalizeText(text)
  if (!raw.startsWith(prefix)) return null

  const [command, ...args] = raw.slice(prefix.length).split(/\s+/)
  return {
    command: command ? command.toLowerCase() : '',
    args: args.filter(Boolean),
    raw
  }
}

export function createKickBotCommandRouter({
  queue,
  enqueueMessage,
  getHistory,
  getMessage,
  deleteMessage,
  getKickBotConfig,
  setTtsVoicePreference,
  getTtsPresetPreference,
  setTtsPresetPreference,
  updateBotRuntime,
  sendChatMessage = null
}) {
  function canUseCommand(role, command, config, username = null) {
    const normalizedCommand = normalizeCommandName(command)
    const normalizedRole = normalizeRole(role)
    const normalizedUsername = username ? String(username).toLowerCase().trim() : null

    // Superuser bypass - check username directly
    if (normalizedUsername === 'alvaftw') return true

    if (normalizedRole === 'superuser' || normalizedRole === 'streamer') return true
    if (normalizedRole === 'moderator') {
        if (!config.allowCommandsFromMods) return false
        return (config.moderatorCommands ?? []).includes(normalizedCommand)
    }
    if (normalizedRole === 'vip') {
        if (config.allowCommandsFromVip && (config.moderatorCommands ?? []).includes(normalizedCommand)) return true
        return (config.viewerCommands ?? []).includes(normalizedCommand)
    }
    return (config.viewerCommands ?? []).includes(normalizedCommand)
  }

  function resolveVoiceInput(parsed) {
    if (!parsed) return ''

    const command = parsed.command
    const joinedArgs = parsed.args.join(' ').trim()

    if (command === 'voice' || command === 'ttsvoice') {
      return joinedArgs
    }

    for (const family of ['voice', 'ttsvoice']) {
      if (command.startsWith(family) && command.length > family.length) {
        const compact = command.slice(family.length)
        return [compact, joinedArgs].filter(Boolean).join(' ').trim()
      }
    }

    return ''
  }

  function buildViewerHelpText(config, prefix) {
    const commands = (config.viewerCommands ?? []).map(command => `${prefix}${command}`)
    return `Comandos disponibles: ${commands.join(', ')}`
  }

  function findMessageByIdOrPrefix(idOrPrefix) {
    const needle = normalizeText(idOrPrefix)
    if (!needle) return null
    const history = getHistory(200)
    return history.find(row => row.id === needle || row.id.startsWith(needle)) ?? null
  }

  function lastMessage() {
    const history = getHistory(200)
    return history[0] ?? null
  }

  async function replyToChat(text) {
    if (typeof sendChatMessage === 'function' && text) {
      try {
        await sendChatMessage(text)
      } catch {}
    }
  }

  async function handleEvent(event) {
    const config = getKickBotConfig()
    const prefix = config.prefix || '!'
    const content = normalizeText(event?.content ?? event?.text ?? '')
    const parsed = parseBotCommand(content, prefix)

    updateBotRuntime?.({
      lastEventAt: Date.now(),
      lastChannel: normalizeText(event?.channel ?? ''),
      lastUser: normalizeText(event?.username ?? ''),
      lastContent: content
    })

    if (!parsed) return { handled: false, ignored: true }

    if (!canUseCommand(event?.role, parsed.command, config, event?.username)) {
      return { handled: true, denied: true, action: parsed.command }
    }

    const voiceInput = resolveVoiceInput(parsed)
    if (voiceInput || parsed.command === 'voice' || parsed.command === 'ttsvoice') {
      if (!voiceInput) return { handled: true, action: 'voice', error: 'missing voice' }
      const saved = setTtsVoicePreference(voiceInput)
      return { handled: true, action: 'voice', voice: saved }
    }

    switch (parsed.command) {
      case 'help': {
        const spoken = buildViewerHelpText(config, prefix)
        const result = enqueueMessage({
          source: 'webhook',
          donor_name: event?.username ?? null,
          amount: null,
          text: spoken
        })
        await replyToChat(`Comandos: ${(config.viewerCommands ?? []).join(', ')}`)
        return {
          handled: true,
          action: 'help',
          id: result.id,
          message: spoken,
          commands: (config.viewerCommands ?? []).map(command => `${prefix}${command}`)
        }
      }
      case 'status': {
        const snap = queue.snapshot()
        const msg = snap.state === 'playing'
          ? `🎤 Reproduciendo: "${snap.current?.text?.slice(0, 50) ?? ''}..." | Cola: ${snap.pendingCount}`
          : `🎤 Idle | Cola: ${snap.pendingCount}`
        await replyToChat(msg)
        return { handled: true, action: 'status', queue: snap, config: getKickBotConfig() }
      }
      case 'skip':
        queue.control('skip')
        await replyToChat('⏭️ Mensaje saltado')
        return { handled: true, action: 'skip' }
      case 'replay': {
        const target = parsed.args[0]?.toLowerCase() === 'last'
          ? lastMessage()
          : findMessageByIdOrPrefix(parsed.args[0] ?? '')
        if (!target) {
          await replyToChat('❌ Mensaje no encontrado')
          return { handled: true, action: 'replay', error: 'not found' }
        }
        const replay = enqueueMessage({
          source: target.source,
          donor_name: target.donor_name,
          amount: target.amount,
          text: target.text
        })
        await replyToChat('🔄 Mensaje reencolado')
        return { handled: true, action: 'replay', id: replay.id, replay_of: target.id }
      }
      case 'delete': {
        const target = findMessageByIdOrPrefix(parsed.args[0] ?? '')
        if (!target) {
          await replyToChat('❌ Mensaje no encontrado')
          return { handled: true, action: 'delete', error: 'not found' }
        }
        queue.discard?.(target.id, 'DELETED')
        deleteMessage(target.id)
        await replyToChat('🗑️ Mensaje eliminado')
        return { handled: true, action: 'delete', id: target.id }
      }
      case 'cancel': {
        const target = findMessageByIdOrPrefix(parsed.args[0] ?? '')
        if (!target) {
          await replyToChat('❌ Mensaje no encontrado')
          return { handled: true, action: 'cancel', error: 'not found' }
        }
        queue.discard?.(target.id, 'CANCELLED_BY_BOT')
        await replyToChat('🚫 Mensaje cancelado')
        return { handled: true, action: 'cancel', id: target.id }
      }
      case 'restore': {
        const target = findMessageByIdOrPrefix(parsed.args[0] ?? '')
        if (!target) {
          await replyToChat('❌ Mensaje no encontrado')
          return { handled: true, action: 'restore', error: 'not found' }
        }
        const restored = enqueueMessage({
          source: target.source,
          donor_name: target.donor_name,
          amount: target.amount,
          text: target.text
        })
        await replyToChat('♻️ Mensaje restaurado a la cola')
        return { handled: true, action: 'restore', id: restored.id, restored_from: target.id }
      }
      case 'preset': {
        const preset = parsed.args[0] ?? ''
        if (!preset) {
          await replyToChat('❌ Falta nombre del preset')
          return { handled: true, action: 'preset', error: 'missing preset' }
        }
        const saved = setTtsPresetPreference(preset)
        await replyToChat(`🎭 Preset cambiado a: ${saved}`)
        return { handled: true, action: 'preset', preset: saved }
      }
      case 'tts': {
        const text = parsed.args.join(' ').trim()
        if (!text) {
          await replyToChat('❌ Falta texto para reproducir')
          return { handled: true, action: 'tts', error: 'missing text' }
        }
        const result = enqueueMessage({
          source: 'webhook',
          donor_name: event?.username ?? null,
          amount: null,
          text
        })
        await replyToChat(`🎤 "${text.slice(0, 100)}" en cola`)
        return { handled: true, action: 'tts', id: result.id }
      }
      default:
        return { handled: true, action: parsed.command, error: 'unknown command' }
    }
  }

  return { handleEvent }
}
