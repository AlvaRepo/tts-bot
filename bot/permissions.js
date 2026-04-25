// =============================
// Permisos data-driven - SIN Hardcodeos
// =============================

const ROLE_ALIASES = {
  streamer: ['streamer', 'owner'],
  superuser: ['superuser'],
  moderator: ['moderator', 'mod'],
  vip: ['vip'],
  subscriber: ['subscriber', 'sub'],
  viewer: ['viewer']
}

const COMMAND_ALIASES = {
  voice: ['voice', 'ttsvoice']
}

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : ''
}

export function normalizeRole(role) {
  if (!role) return 'viewer'
  const normalized = normalizeText(role).toLowerCase()
  
  for (const [canonical, aliases] of Object.entries(ROLE_ALIASES)) {
    if (aliases.includes(normalized)) return canonical
  }
  return 'viewer'
}

export function normalizeCommand(command) {
  if (!command) return null
  const normalized = normalizeText(command).toLowerCase()
  return COMMAND_ALIASES[normalized]?.[0] ?? normalized
}

export function canUseCommand({ role, username, command, config }) {
  const normalizedRole = normalizeRole(role)
  const normalizedCommand = normalizeCommand(command)
  const normalizedUsername = normalizeText(username).toLowerCase()

  // Superusers desde config (NO hardcodeado)
  const superusers = new Set(
    (config.superusers ?? []).map(u => normalizeText(u).toLowerCase()).filter(Boolean)
  )
  if (superusers.has(normalizedUsername)) return true

  // Streamer/superuser siempre permitido
  if (['streamer', 'superuser'].includes(normalizedRole)) return true

  // Lookup O(1) usando Set en commandPermissions
  const allowedRoles = config.commandPermissions?.[normalizedCommand]
  if (!allowedRoles) return false

  const allowedSet = new Set(allowedRoles)
  return allowedSet.has(normalizedRole)
}

export function getAvailableCommands(config) {
  return Object.keys(config.commandPermissions ?? {})
}

export function getAllowedRoles(command, config) {
  const normalized = normalizeCommand(command)
  return config.commandPermissions?.[normalized] ?? []
}