import { supabase, supabaseAdmin } from './supabase-client.js'
import { existsSync, unlinkSync } from 'fs'

const SUPABASE_SILENT = process.env.SUPABASE_SILENT === '1' || process.env.NODE_ENV === 'test' || !process.env.SUPABASE_URL

const memoryStore = {
  settings: new Map(),
  messages: new Map(),
  webhookDedupe: new Map()
}

function cloneRow(row) {
  return row ? structuredClone(row) : row
}

function memoryNowIso() {
  return new Date().toISOString()
}

function logSupabaseError(...args) {
  if (SUPABASE_SILENT) return
  console.error(...args)
}

// Configuración por defecto
const DEFAULT_TTS_VOICE = 'es-AR-TomasNeural'
export const AVAILABLE_TTS_VOICES = [
  'es-AR-TomasNeural',
  'es-AR-ElenaNeural',
  'es-ES-AlvaroNeural',
  'es-ES-ElviraNeural',
  'es-MX-JorgeNeural',
  'es-MX-DaliaNeural',
  'en-US-GuyNeural',
  'en-US-JennyNeural'
]

const TTS_VOICE_ALIASES = {
  alvaro: 'es-ES-AlvaroNeural',
  elena: 'es-AR-ElenaNeural',
  tomas: 'es-AR-TomasNeural',
  jorge: 'es-MX-JorgeNeural',
  dalia: 'es-MX-DaliaNeural',
  guy: 'en-US-GuyNeural',
  jenny: 'en-US-JennyNeural'
}

export const TTS_EMOTION_PRESETS = {
  neutral: { label: 'Neutral', voice: 'default', rate: '+0%', volume: '+0%', pitch: '+0Hz', description: 'Equilibrada, clara y segura.' },
  warm: { label: 'Cálida', voice: 'default', rate: '-5%', volume: '+0%', pitch: '+10Hz', description: 'Más cercana, amable y humana.' },
  hype: { label: 'Hype', voice: 'default', rate: '+12%', volume: '+12%', pitch: '+18Hz', description: 'Más energía para alerts y donaciones.' },
  dramatic: { label: 'Dramática', voice: 'default', rate: '-8%', volume: '+0%', pitch: '-8Hz', description: 'Más tensión, pausa y peso.' },
  sad: { label: 'Triste', voice: 'default', rate: '-12%', volume: '-8%', pitch: '-12Hz', description: 'Más lenta y apagada.' },
  whisper: { label: 'Susurro', voice: 'default', rate: '-15%', volume: '-25%', pitch: '-6Hz', description: 'Íntima y suave, para remates o secretos.' },
  robot: { label: 'Robot', voice: 'default', rate: '-2%', volume: '+0%', pitch: '-18Hz', description: 'Más plana y mecánica.' },
  announcer: { label: 'Locutor', voice: 'default', rate: '+6%', volume: '+8%', pitch: '+4Hz', description: 'Más radial y firme.' },
  excited: { label: 'Entusiasmada', voice: 'default', rate: '+10%', volume: '+10%', pitch: '+14Hz', description: 'Sonido vivo y expresivo.' }
}

const DEFAULT_BOT_CONFIG = {
  enabled: false,
  channel: '',
  chatroomId: null,
  prefix: '!',
  superusers: ['alvaftw'],
  
  commandPermissions: {
    help:    ['viewer', 'subscriber', 'vip', 'moderator', 'streamer'],
    status:  ['viewer', 'subscriber', 'vip', 'moderator', 'streamer'],
    queue:   ['viewer', 'subscriber', 'vip', 'moderator', 'streamer'],
    voices:  ['viewer', 'subscriber', 'vip', 'moderator', 'streamer'],
    uptime:  ['viewer', 'subscriber', 'vip', 'moderator', 'streamer'],
    quote:   ['viewer', 'subscriber', 'vip', 'moderator', 'streamer'],
    randomquote: ['viewer', 'subscriber', 'vip', 'moderator', 'streamer'],
    lurk:    ['viewer', 'subscriber', 'vip', 'moderator', 'streamer'],
    tts:     ['subscriber', 'vip', 'moderator', 'streamer'],
    decir:   ['subscriber', 'vip', 'moderator', 'streamer'],
    voice:   ['vip', 'moderator', 'streamer'],
    preset:  ['vip', 'moderator', 'streamer'],
    skip:    ['moderator', 'streamer'],
    replay:  ['moderator', 'streamer'],
    delete:  ['moderator', 'streamer'],
    cancel:  ['moderator', 'streamer'],
    restore: ['moderator', 'streamer'],
    pokemon: ['subscriber', 'vip', 'moderator', 'streamer']
  },
  
  // Legacy fields (mantenidos para backward compatibility)
  allowTtsFromChat: true,
  allowCommandsFromMods: true,
  allowCommandsFromVip: true,
  allowCommandsFromSubscribers: true,
  sessionToken: ''
}

// Validación de UUID básica para evitar errores de PostgreSQL
function isValidUuid(id) {
  return id && typeof id === 'string' && id !== 'undefined' && id !== 'null'
}

// Funciones auxiliares para settings
async function getSetting(key) {
  if (SUPABASE_SILENT) return memoryStore.settings.has(key) ? memoryStore.settings.get(key) : null

  const { data, error } = await supabase
    .from('settings')
    .select('value')
    .eq('key', key)
    .single()
  
  if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
    console.error('Error al leer setting:', key, error)
  }
  
  return data?.value || null
}

async function setSetting(key, value) {
  if (SUPABASE_SILENT) {
    memoryStore.settings.set(key, value)
    return
  }

  const { error } = await supabaseAdmin
    .from('settings')
    .upsert({ 
      key, 
      value, 
      updated_at: new Date().toISOString() 
    }, { onConflict: 'key' })
  
  if (error) {
    console.error('Error al guardar setting:', key, error)
    throw error
  }
}

async function getSettingJson(key, fallback = []) {
  const raw = await getSetting(key)
  if (raw === null) return fallback
  try {
    return JSON.parse(raw)
  } catch {
    return fallback
  }
}

async function getSettingBoolean(key, fallback = false) {
  const raw = await getSetting(key)
  if (raw === null) return fallback
  return raw === 'true' || raw === '1' || raw === true
}

// Funciones principales de mensajes
export async function insertMessage(msg) {
  if (SUPABASE_SILENT) {
    const row = {
      id: msg.id,
      source: msg.source,
      donor_name: msg.donor_name || null,
      amount: msg.amount || null,
      text: msg.text,
      status: msg.status || 'PENDING',
      retries: msg.retries || 0,
      audio_path: msg.audio_path || null,
      created_at: new Date(msg.created_at || Date.now()).toISOString(),
      updated_at: memoryNowIso(),
      error_msg: msg.error_msg || null
    }
    memoryStore.messages.set(row.id, row)
    return cloneRow(row)
  }

  const { data, error } = await supabaseAdmin
    .from('messages')
    .insert({
      id: msg.id,
      source: msg.source,
      donor_name: msg.donor_name || null,
      amount: msg.amount || null,
      text: msg.text,
      status: msg.status || 'PENDING',
      retries: msg.retries || 0,
      audio_path: msg.audio_path || null,
      created_at: new Date(msg.created_at || Date.now()).toISOString(),
      updated_at: new Date().toISOString(),
      error_msg: msg.error_msg || null
    })
    .select()
  
  if (error) {
    logSupabaseError('Error al insertar mensaje:', error)
    throw error
  }
  
  // Supabase devuelve un array en INSERT con .select(), tomamos el primer elemento
  return data && data.length > 0 ? data[0] : null
}

export async function getMessage(id) {
  if (!isValidUuid(id)) {
    logSupabaseError('Error al obtener mensaje: ID inválido:', id)
    return null
  }

  if (SUPABASE_SILENT) {
    return cloneRow(memoryStore.messages.get(id) || null)
  }
  
  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .eq('id', id)
  
  if (error) {
    logSupabaseError('Error al obtener mensaje:', error)
    return null
  }
  
  // Supabase devuelve un array, tomamos el primer elemento
  return data && data.length > 0 ? data[0] : null
}

export async function updateMessage(id, fields) {
  if (!isValidUuid(id)) {
    logSupabaseError('Error al actualizar mensaje: ID inválido:', id)
    return null
  }

  if (SUPABASE_SILENT) {
    const current = memoryStore.messages.get(id)
    if (!current) return null
    const updated = {
      ...current,
      ...fields,
      updated_at: memoryNowIso()
    }
    memoryStore.messages.set(id, updated)
    return cloneRow(updated)
  }
  
  const updateData = {
    ...fields,
    updated_at: new Date().toISOString()
  }
  
  const { data, error } = await supabaseAdmin
    .from('messages')
    .update(updateData)
    .eq('id', id)
    .select()
  
  if (error) {
    logSupabaseError('Error al actualizar mensaje:', error)
    // Si no encuentra el mensaje, intentar obtenerlo
    return getMessage(id)
  }
  
  // Supabase devuelve un array en los UPDATE, tomamos el primer elemento
  return data && data.length > 0 ? data[0] : await getMessage(id)
}

export async function getHistory(limit = 50, filters = {}) {
  if (SUPABASE_SILENT) {
    const rows = [...memoryStore.messages.values()]
      .filter(row => {
        if (filters.status && filters.status !== 'all' && row.status !== filters.status) return false
        if (filters.source && filters.source !== 'all' && row.source !== filters.source) return false
        if (filters.query) {
          const q = String(filters.query).toLowerCase()
          const haystack = [row.text, row.donor_name, row.id].filter(Boolean).join(' ').toLowerCase()
          if (!haystack.includes(q)) return false
        }
        return true
      })
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, limit)
    return rows.map(cloneRow)
  }

  let query = supabase
    .from('messages')
    .select('*')
  
  if (filters.status && filters.status !== 'all') {
    query = query.eq('status', filters.status)
  }
  
  if (filters.source && filters.source !== 'all') {
    query = query.eq('source', filters.source)
  }
  
  if (filters.query) {
    query = query.or(`text.ilike.%${filters.query}%,donor_name.ilike.%${filters.query}%,id.ilike.%${filters.query}%`)
  }
  
  const { data, error } = await query
    .order('created_at', { ascending: false })
    .limit(limit)
  
  if (error) {
    logSupabaseError('Error al obtener historial:', error)
    return []
  }
  
  return data || []
}

export async function deleteMessage(id) {
  if (SUPABASE_SILENT) {
    const message = memoryStore.messages.get(id)
    if (!message) return null
    memoryStore.messages.delete(id)
    return cloneRow(message)
  }

  const message = await getMessage(id)
  if (!message) return null
  
  // Eliminar archivo de audio si existe
  if (message.audio_path && existsSync(message.audio_path)) {
    try { unlinkSync(message.audio_path) } catch {}
  }
  
  const { error } = await supabaseAdmin
    .from('messages')
    .delete()
    .eq('id', id)
  
  if (error) {
    logSupabaseError('Error al eliminar mensaje:', error)
  }
  
  return message
}

// Funciones de configuración de audio profile
export async function getAudioProfilePreference() {
  const value = await getSetting('audioProfilePreference')
  return sanitizeAudioProfilePreference(value || 'auto')
}

export async function setAudioProfilePreference(value) {
  const sanitized = sanitizeAudioProfilePreference(value)
  await setSetting('audioProfilePreference', sanitized)
  return sanitized
}

export function sanitizeAudioProfilePreference(value) {
  if (typeof value !== 'string') return 'auto'
  const normalized = value.trim().toLowerCase()
  const validValues = new Set(['auto', 'high', 'lite'])
  return validValues.has(normalized) ? normalized : 'auto'
}

// Funciones de filtros
export async function getMessageFilterConfig() {
  const enabled = await getSettingBoolean('messageFilterEnabled', false)
  const blacklist = await getSettingJson('messageFilterBlacklist', [])
  
  return {
    enabled,
    blacklist: blacklist
      .filter(value => typeof value === 'string')
      .map(value => value.trim().toLowerCase())
      .filter(Boolean)
  }
}

export async function setMessageFilterConfig(config = {}) {
  const enabled = Boolean(config.enabled)
  const blacklist = Array.isArray(config.blacklist)
    ? [...new Set(config.blacklist.map(item => String(item).trim().toLowerCase()).filter(Boolean))]
    : []
  
  await setSetting('messageFilterEnabled', JSON.stringify(enabled))
  await setSetting('messageFilterBlacklist', JSON.stringify(blacklist))
  
  return { enabled, blacklist }
}

export async function evaluateMessageFilter(text) {
  const value = typeof text === 'string' ? text.trim().toLowerCase() : ''
  if (!value) return { blocked: false, reason: null }
  
  const config = await getMessageFilterConfig()
  if (!config.enabled || config.blacklist.length === 0) {
    return { blocked: false, reason: null }
  }
  
  const hit = config.blacklist.find(entry => value.includes(entry))
  if (!hit) return { blocked: false, reason: null }
  
  return {
    blocked: true,
    reason: `FILTERED: contiene palabra bloqueada "${hit}"`
  }
}

// Funciones de voz TTS
export async function getTtsVoicePreference() {
  const value = await getSetting('ttsVoice')
  return sanitizeTtsVoicePreference(value || DEFAULT_TTS_VOICE)
}

export async function setTtsVoicePreference(value) {
  const sanitized = sanitizeTtsVoicePreference(value)
  await setSetting('ttsVoice', sanitized)
  return sanitized
}

export function sanitizeTtsVoicePreference(value) {
  if (typeof value !== 'string') return DEFAULT_TTS_VOICE
  const normalized = value.trim()
  if (normalized.length === 0) return DEFAULT_TTS_VOICE
  if (normalized.toLowerCase() === 'auto') return DEFAULT_TTS_VOICE
  
  const alias = TTS_VOICE_ALIASES[normalized.toLowerCase()]
  if (alias) return alias
  
  const canonical = AVAILABLE_TTS_VOICES.find(voice => voice.toLowerCase() === normalized.toLowerCase())
  if (canonical) return canonical
  
  return normalized
}

// Funciones de preset TTS
export async function getTtsPresetPreference() {
  const value = await getSetting('ttsPreset')
  return sanitizeTtsPresetPreference(value || 'neutral')
}

export async function setTtsPresetPreference(value) {
  const sanitized = sanitizeTtsPresetPreference(value)
  await setSetting('ttsPreset', sanitized)
  return sanitized
}

export function sanitizeTtsPresetPreference(value) {
  if (typeof value !== 'string') return 'neutral'
  const normalized = value.trim().toLowerCase()
  return Object.prototype.hasOwnProperty.call(TTS_EMOTION_PRESETS, normalized) ? normalized : 'neutral'
}

// Funciones de volumen del audio
export async function getAudioVolume() {
  const value = await getSetting('audioVolume')
  return sanitizeAudioVolume(value || 0.3)
}

export async function setAudioVolume(value) {
  const sanitized = sanitizeAudioVolume(value)
  await setSetting('audioVolume', String(sanitized))
  return sanitized
}

export function sanitizeAudioVolume(value) {
  if (typeof value === 'number') {
    return Math.min(2.0, Math.max(0.0, value))
  }
  if (typeof value === 'string') {
    const parsed = parseFloat(value)
    if (Number.isFinite(parsed)) {
      return Math.min(2.0, Math.max(0.0, parsed))
    }
  }
  return 1.0
}

// Funciones de volumen para sonidos (Pokemon cries)
export async function getPokemonAudioVolume() {
  const value = await getSetting('pokemonAudioVolume')
  return sanitizeAudioVolume(value || 0.3)
}

export async function setPokemonAudioVolume(value) {
  const sanitized = sanitizeAudioVolume(value)
  await setSetting('pokemonAudioVolume', String(sanitized))
  return sanitized
}

// Funciones de configuración del bot de Kick
export async function getKickBotConfig() {
  const value = await getSetting('kickBotConfig')
  const sanitized = sanitizeKickBotConfig(value || DEFAULT_BOT_CONFIG)
  
  // Si el valor guardado no coincide con el sanitizado, actualizar
  if (value && value !== JSON.stringify(sanitized)) {
    await setKickBotConfig(sanitized)
  }
  
  return sanitized
}

export async function setKickBotConfig(value) {
  const sanitized = sanitizeKickBotConfig(value)
  await setSetting('kickBotConfig', JSON.stringify(sanitized))
  return sanitized
}

export function sanitizeKickBotConfig(value) {
  const input = typeof value === 'string'
    ? safeJsonParse(value, {})
    : (value && typeof value === 'object' ? value : {})
  
  // Parse chatroomId - puede venir como number o string
  let chatroomId = null
  if (input.chatroomId) {
    const parsed = parseInt(String(input.chatroomId), 10)
    if (!isNaN(parsed) && parsed > 0) chatroomId = parsed
  }
  
  // Superusers desde config
  const superusers = Array.isArray(input.superusers)
    ? input.superusers.filter(u => typeof u === 'string').map(u => u.trim().toLowerCase())
    : DEFAULT_BOT_CONFIG.superusers
  
  // Si existe commandPermissions, usar directamente
  const hasCommandPermissions = input.commandPermissions && typeof input.commandPermissions === 'object'
  
  // Si NO existe commandPermissions pero existe estructura legacy, migrar automáticamente
  let commandPermissions = hasCommandPermissions ? input.commandPermissions : {}

  if (!hasCommandPermissions) {
    // Migrar desde estructura legacy
    commandPermissions = migrateLegacyPermissions(input)
  }

  if (Array.isArray(commandPermissions.tts) && !Array.isArray(commandPermissions.decir)) {
    commandPermissions = {
      ...commandPermissions,
      decir: [...commandPermissions.tts]
    }
  }
  
  return {
    enabled: Boolean(input.enabled),
    channel: typeof input.channel === 'string' ? input.channel.trim().replace(/^#/, '') : '',
    chatroomId,
    prefix: typeof input.prefix === 'string' && input.prefix.trim().length > 0 ? input.prefix.trim() : '!',
    superusers,
    commandPermissions,
    allowTtsFromChat: input.allowTtsFromChat !== false,
    allowCommandsFromMods: input.allowCommandsFromMods !== false,
    allowCommandsFromVip: input.allowCommandsFromVip === true,
    allowCommandsFromSubscribers: input.allowCommandsFromSubscribers !== false,
    sessionToken: typeof input.sessionToken === 'string' && input.sessionToken.trim().length > 0 ? input.sessionToken.trim() : '',
    
    // Customer OAuth tokens (for sending TTS to customer's channel)
    customerAccessToken: typeof input.customerAccessToken === 'string' && input.customerAccessToken.trim().length > 0 ? input.customerAccessToken.trim() : null,
    customerRefreshToken: typeof input.customerRefreshToken === 'string' && input.customerRefreshToken.trim().length > 0 ? input.customerRefreshToken.trim() : null,
    customerBroadcasterId: input.customerBroadcasterId ? parseInt(String(input.customerBroadcasterId), 10) : null,
    customerUsername: typeof input.customerUsername === 'string' && input.customerUsername.trim().length > 0 ? input.customerUsername.trim() : null,
    customerChatroomId: input.customerChatroomId ? parseInt(String(input.customerChatroomId), 10) : null
  }
}

function migrateLegacyPermissions(input) {
  const legacyPermissions = {}
  
  // Moderator commands
  if (input.allowCommandsFromMods !== false && input.moderatorCommands?.length) {
    for (const cmd of input.moderatorCommands) {
      if (!legacyPermissions[cmd]) legacyPermissions[cmd] = []
      if (!legacyPermissions[cmd].includes('moderator')) legacyPermissions[cmd].push('moderator')
      if (!legacyPermissions[cmd].includes('streamer')) legacyPermissions[cmd].push('streamer')
    }
  }
  
  // VIP commands
  if (input.allowCommandsFromVip && input.vipCommands?.length) {
    for (const cmd of input.vipCommands) {
      if (!legacyPermissions[cmd]) legacyPermissions[cmd] = []
      if (!legacyPermissions[cmd].includes('vip')) legacyPermissions[cmd].push('vip')
    }
  }
  
  // Subscriber commands
  if (input.allowCommandsFromSubscribers !== false && input.subscriberCommands?.length) {
    for (const cmd of input.subscriberCommands) {
      if (!legacyPermissions[cmd]) legacyPermissions[cmd] = []
      if (!legacyPermissions[cmd].includes('subscriber')) legacyPermissions[cmd].push('subscriber')
    }
  }
  
  // Viewer commands
  if (input.viewerCommands?.length) {
    for (const cmd of input.viewerCommands) {
      if (!legacyPermissions[cmd]) legacyPermissions[cmd] = []
      if (!legacyPermissions[cmd].includes('viewer')) legacyPermissions[cmd].push('viewer')
    }
  }
  
  // Si no hay permisos legacy, usar defaults
  if (Object.keys(legacyPermissions).length === 0) {
    return DEFAULT_BOT_CONFIG.commandPermissions
  }
  
  return legacyPermissions
}

// Funciones de webhook dedupe
export async function claimWebhookDelivery({ provider, dedupe_key, source = 'webhook', provider_event_id = null, provider_delivery_id = null, payload_json = null }) {
  const now = new Date().toISOString()
    
  const { data, error } = await supabaseAdmin
    .from('webhook_dedupe')
    .insert({
      provider,
      dedupe_key,
      source,
      provider_event_id,
      provider_delivery_id,
      payload_json,
      status: 'CLAIMED',
      created_at: now,
      updated_at: now
    })
    .select()
    .single()
    
  if (error) {
    // Probablemente es un duplicado
    const existing = await getWebhookDelivery(provider, dedupe_key)
    return { claimed: false, duplicate: true, delivery: existing }
  }
  
  return { claimed: true, duplicate: false, delivery: data }
}

export async function getWebhookDelivery(provider, dedupeKey) {
  if (SUPABASE_SILENT) {
    return cloneRow(memoryStore.webhookDedupe.get(`${provider}:${dedupeKey}`) || null)
  }

  const { data, error } = await supabase
    .from('webhook_dedupe')
    .select('*')
    .eq('provider', provider)
    .eq('dedupe_key', dedupeKey)
    .single()
    
  if (error && error.code !== 'PGRST116') {
    logSupabaseError('Error al obtener webhook delivery:', error)
  }
  
  return data || null
}

export async function markWebhookDeliveryProcessed(provider, dedupeKey, messageId) {
  if (SUPABASE_SILENT) {
    const key = `${provider}:${dedupeKey}`
    const current = memoryStore.webhookDedupe.get(key) || { provider, dedupe_key: dedupeKey }
    const row = {
      ...current,
      status: 'PROCESSED',
      message_id: messageId,
      error_msg: null,
      updated_at: memoryNowIso()
    }
    memoryStore.webhookDedupe.set(key, row)
    return cloneRow(row)
  }

  const { data, error } = await supabaseAdmin
    .from('webhook_dedupe')
    .update({
      status: 'PROCESSED',
      message_id: messageId,
      error_msg: null,
      updated_at: new Date().toISOString()
    })
    .eq('provider', provider)
    .eq('dedupe_key', dedupeKey)
    .select()
    .single()
    
  if (error) {
    logSupabaseError('Error al marcar webhook como procesado:', error)
  }
  
  return data || getWebhookDelivery(provider, dedupeKey)
}

export async function markWebhookDeliveryFailed(provider, dedupeKey, errorMsg) {
  if (SUPABASE_SILENT) {
    const key = `${provider}:${dedupeKey}`
    const current = memoryStore.webhookDedupe.get(key) || { provider, dedupe_key: dedupeKey }
    const row = {
      ...current,
      status: 'FAILED',
      error_msg: errorMsg,
      updated_at: memoryNowIso()
    }
    memoryStore.webhookDedupe.set(key, row)
    return cloneRow(row)
  }

  const { data, error } = await supabaseAdmin
    .from('webhook_dedupe')
    .update({
      status: 'FAILED',
      error_msg: errorMsg,
      updated_at: new Date().toISOString()
    })
    .eq('provider', provider)
    .eq('dedupe_key', dedupeKey)
    .select()
    .single()
    
  if (error) {
    logSupabaseError('Error al marcar webhook como fallido:', error)
  }
  
  return data || getWebhookDelivery(provider, dedupeKey)
}

export async function releaseWebhookDelivery(provider, dedupeKey) {
  if (SUPABASE_SILENT) {
    memoryStore.webhookDedupe.delete(`${provider}:${dedupeKey}`)
    return
  }

  const { error } = await supabaseAdmin
    .from('webhook_dedupe')
    .delete()
    .eq('provider', provider)
    .eq('dedupe_key', dedupeKey)
    
  if (error) {
    logSupabaseError('Error al liberar webhook:', error)
  }
}

// Funciones auxiliares
function sanitizeCommandList(value, fallback) {
  const list = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(',')
      : Array.isArray(fallback)
        ? fallback
        : []
  
  return [...new Set(list.map(item => String(item).trim().toLowerCase()).filter(Boolean))]
}

function safeJsonParse(value, fallback) {
  try {
    return JSON.parse(value)
  } catch {
    return fallback
  }
}

// Función de inicialización (compatible con db.js)
export function initDB() {
  if (!SUPABASE_SILENT) console.log('✅ Conectado a Supabase (modo initDB)')
  return supabase
}

// Función para limpieza de datos antiguos (opcional, puede usarse con cron)
export async function runCleanup() {
  if (SUPABASE_SILENT) {
    for (const [id, row] of memoryStore.messages.entries()) {
      if (['DONE', 'FAILED', 'SKIPPED'].includes(row.status)) {
        memoryStore.messages.delete(id)
      }
    }
    for (const [key, row] of memoryStore.webhookDedupe.entries()) {
      if (['PROCESSED', 'FAILED'].includes(row.status)) {
        memoryStore.webhookDedupe.delete(key)
      }
    }
    return
  }

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
    
  // Limpiar mensajes antiguos completados
  const { error: msgError } = await supabaseAdmin
    .from('messages')
    .delete()
    .in('status', ['DONE', 'FAILED', 'SKIPPED'])
    .lt('created_at', sevenDaysAgo)
    
  if (msgError) {
    logSupabaseError('Error al limpiar mensajes:', msgError)
  }
    
  // Limpiar webhooks antiguos
  const { error: webError } = await supabaseAdmin
    .from('webhook_dedupe')
    .delete()
    .in('status', ['PROCESSED', 'FAILED'])
    .lt('created_at', sevenDaysAgo)
    
  if (webError) {
    logSupabaseError('Error al limpiar webhooks:', webError)
  }
    
  if (!SUPABASE_SILENT) console.log('🧹 Limpieza de datos antiguos completada')
}
