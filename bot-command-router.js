// =========================
// 1. HELPERS / NORMALIZACIÓN
// =========================

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeRole(value) {
  const role = normalizeText(value).toLowerCase()

  if (['streamer', 'owner'].includes(role)) return 'streamer'
  if (['superuser'].includes(role)) return 'superuser'
  if (['moderator', 'mod'].includes(role)) return 'moderator'
  if (['vip'].includes(role)) return 'vip'
  if (['subscriber', 'sub'].includes(role)) return 'subscriber' // FIX
  return 'viewer'
}

function normalizeCommandName(command) {
  const value = normalizeText(command).toLowerCase()

  // alias simples
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

// =========================
// 2. PERMISOS (DATA-DRIVEN)
// =========================

// Esperado desde Supabase o config externa:
// {
//   commandPermissions: {
//     help: ['viewer', 'subscriber', 'vip', 'moderator', 'streamer'],
//     tts: ['subscriber', 'vip', 'moderator', 'streamer'],
//     skip: ['moderator', 'streamer'],
//     ...
//   },
//   superusers: ['alvaftw']
// }

function canUseCommand({ role, username, command, config }) {
  const normalizedRole = normalizeRole(role)
  const normalizedCommand = normalizeCommandName(command)
  const normalizedUsername = normalizeText(username).toLowerCase()

  const superusers = new Set(
    (config.superusers ?? []).map(u => normalizeText(u).toLowerCase())
  )

  // bypass limpio
  if (superusers.has(normalizedUsername)) return true
  if (['streamer', 'superuser'].includes(normalizedRole)) return true

  const allowedRoles = config.commandPermissions?.[normalizedCommand] ?? []

  return allowedRoles.includes(normalizedRole)
}

// =========================
// 3. HANDLERS DE COMANDOS
// =========================

function createHandlers(deps) {
  const {
    queue,
    enqueueMessage,
    getHistory,
    deleteMessage,
    setTtsVoicePreference,
    setTtsPresetPreference,
    sendChatMessage
  } = deps

  const reply = async (text) => {
    if (typeof sendChatMessage === 'function' && text) {
      try { await sendChatMessage(text) } catch {}
    }
  }

  const findMessage = (idOrPrefix) => {
    const needle = normalizeText(idOrPrefix)
    if (!needle) return null
    const history = getHistory(200)
    return history.find(m => m.id === needle || m.id.startsWith(needle)) ?? null
  }

  const lastMessage = () => getHistory(200)[0] ?? null

  return {
    help: async ({ config, prefix, event }) => {
      const cmds = Object.keys(config.commandPermissions ?? {})
      await reply(`Comandos: ${cmds.map(c => `${prefix}${c}`).join(', ')}`)
      return { handled: true, action: 'help' }
    },

    status: async () => {
      const snap = queue.snapshot()
      const msg = snap.state === 'playing'
        ? `🎤 Reproduciendo | Cola: ${snap.pendingCount}`
        : `🎤 Idle | Cola: ${snap.pendingCount}`
      await reply(msg)
      return { handled: true, action: 'status' }
    },

    skip: async () => {
      queue.control('skip')
      await reply('⏭️ skip')
      return { handled: true, action: 'skip' }
    },

    tts: async ({ parsed, event }) => {
      const text = parsed.args.join(' ').trim()
      if (!text) return { handled: true, error: 'missing text' }

      const result = enqueueMessage({
        source: 'webhook',
        donor_name: event?.username ?? null,
        amount: null,
        text
      })

      await reply(`🎤 en cola`)
      return { handled: true, action: 'tts', id: result.id }
    },

    voice: async ({ parsed }) => {
      const voice = parsed.args.join(' ').trim()
      if (!voice) return { handled: true, error: 'missing voice' }

      const saved = setTtsVoicePreference(voice)
      return { handled: true, action: 'voice', voice: saved }
    },

    delete: async ({ parsed }) => {
      const target = findMessage(parsed.args[0])
      if (!target) return { handled: true, error: 'not found' }

      queue.discard?.(target.id, 'DELETED')
      deleteMessage(target.id)

      await reply('🗑️ eliminado')
      return { handled: true, action: 'delete' }
    },

    replay: async ({ parsed }) => {
      const target = parsed.args[0] === 'last'
        ? lastMessage()
        : findMessage(parsed.args[0])

      if (!target) return { handled: true, error: 'not found' }

      const replay = enqueueMessage({ ...target })
      await reply('🔄 replay')

      return { handled: true, action: 'replay', id: replay.id }
    }
  }
}

// =========================
// 4. ROUTER PRINCIPAL
// =========================

export function createKickBotCommandRouter(deps) {
  const {
    getKickBotConfig,
    updateBotRuntime
  } = deps

  const handlers = createHandlers(deps)

  async function handleEvent(event) {
    const config = getKickBotConfig()
    const prefix = config.prefix || '!'

    const content = normalizeText(event?.content ?? event?.text ?? '')
    const parsed = parseBotCommand(content, prefix)

    updateBotRuntime?.({
      lastEventAt: Date.now(),
      lastUser: normalizeText(event?.username ?? ''),
      lastContent: content
    })

    if (!parsed) {
      return { handled: false, ignored: true }
    }

    const commandName = normalizeCommandName(parsed.command)

    const allowed = canUseCommand({
      role: event?.role,
      username: event?.username,
      command: commandName,
      config
    })

    if (!allowed) {
      return { handled: true, denied: true, action: commandName }
    }

    const handler = handlers[commandName]

    if (!handler) {
      return { handled: true, error: 'unknown command', action: commandName }
    }

    return handler({
      event,
      parsed,
      config,
      prefix
    })
  }

  return { handleEvent }
}