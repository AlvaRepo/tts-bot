import { supabase, supabaseAdmin } from './supabase-client.js'
import { existsSync, unlinkSync } from 'fs'

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
  allowTtsFromChat: true,
  allowCommandsFromMods: true,
  allowCommandsFromVip: true,
  viewerCommands: ['help', 'status', 'tts'],
  moderatorCommands: ['help', 'status', 'tts', 'skip', 'replay', 'voice', 'preset', 'cancel', 'delete', 'restore'],
  streamerCommands: ['help', 'status', 'tts', 'skip', 'replay', 'voice', 'preset', 'cancel', 'delete', 'restore']
}

// Validación de UUID básica para evitar errores de PostgreSQL
function isValidUuid(id) {
  return id && typeof id === 'string' && id !== 'undefined' && id !== 'null'
}

// Funciones auxiliares para settings
async function getSetting(key) {
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
    console.error('Error al insertar mensaje:', error)
    throw error
  }
  
  // Supabase devuelve un array en INSERT con .select(), tomamos el primer elemento
  return data && data.length > 0 ? data[0] : null
}

export async function getMessage(id) {
  if (!isValidUuid(id)) {
    console.error('Error al obtener mensaje: ID inválido:', id)
    return null
  }
  
  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .eq('id', id)
  
  if (error) {
    console.error('Error al obtener mensaje:', error)
    return null
  }
  
  // Supabase devuelve un array, tomamos el primer elemento
  return data && data.length > 0 ? data[0] : null
}

export async function updateMessage(id, fields) {
  if (!isValidUuid(id)) {
    console.error('Error al actualizar mensaje: ID inválido:', id)
    return null
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
    console.error('Error al actualizar mensaje:', error)
    // Si no encuentra el mensaje, intentar obtenerlo
    return getMessage(id)
  }
  
  // Supabase devuelve un array en los UPDATE, tomamos el primer elemento
  return data && data.length > 0 ? data[0] : await getMessage(id)
}

export async function getHistory(limit = 50, filters = {}) {
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
    console.error('Error al obtener historial:', error)
    return []
  }
  
  return data || []
}

export async function deleteMessage(id) {
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
    console.error('Error al eliminar mensaje:', error)
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
  
  const viewerCommands = sanitizeCommandList(input.viewerCommands, DEFAULT_BOT_CONFIG.viewerCommands)
  const moderatorCommands = sanitizeCommandList(input.moderatorCommands, DEFAULT_BOT_CONFIG.moderatorCommands)
  const streamerCommands = sanitizeCommandList(input.streamerCommands, DEFAULT_BOT_CONFIG.streamerCommands)

  // Parse chatroomId - puede venir como number o string
  let chatroomId = null
  if (input.chatroomId) {
    const parsed = parseInt(String(input.chatroomId), 10)
    if (!isNaN(parsed) && parsed > 0) chatroomId = parsed
  }
  
  return {
    enabled: Boolean(input.enabled),
    channel: typeof input.channel === 'string' ? input.channel.trim().replace(/^#/, '') : '',
    chatroomId,
    prefix: typeof input.prefix === 'string' && input.prefix.trim().length > 0 ? input.prefix.trim() : '!',
    allowTtsFromChat: input.allowTtsFromChat !== false,
    allowCommandsFromMods: input.allowCommandsFromMods !== false,
    allowCommandsFromVip: input.allowCommandsFromVip === true,
    viewerCommands,
    moderatorCommands,
    streamerCommands
  }
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
  const { data, error } = await supabase
    .from('webhook_dedupe')
    .select('*')
    .eq('provider', provider)
    .eq('dedupe_key', dedupeKey)
    .single()
    
  if (error && error.code !== 'PGRST116') {
    console.error('Error al obtener webhook delivery:', error)
  }
  
  return data || null
}

export async function markWebhookDeliveryProcessed(provider, dedupeKey, messageId) {
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
    console.error('Error al marcar webhook como procesado:', error)
  }
  
  return data || getWebhookDelivery(provider, dedupeKey)
}

export async function markWebhookDeliveryFailed(provider, dedupeKey, errorMsg) {
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
    console.error('Error al marcar webhook como fallido:', error)
  }
  
  return data || getWebhookDelivery(provider, dedupeKey)
}

export async function releaseWebhookDelivery(provider, dedupeKey) {
  const { error } = await supabaseAdmin
    .from('webhook_dedupe')
    .delete()
    .eq('provider', provider)
    .eq('dedupe_key', dedupeKey)
    
  if (error) {
    console.error('Error al liberar webhook:', error)
  }
}

// Funciones auxiliares
function sanitizeCommandList(value, fallback) {
  const list = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(',')
      : fallback
    
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
  console.log('✅ Conectado a Supabase (modo initDB)')
  return supabase
}

// Función para limpieza de datos antiguos (opcional, puede usarse con cron)
export async function runCleanup() {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
    
  // Limpiar mensajes antiguos completados
  const { error: msgError } = await supabaseAdmin
    .from('messages')
    .delete()
    .in('status', ['DONE', 'FAILED', 'SKIPPED'])
    .lt('created_at', sevenDaysAgo)
    
  if (msgError) {
    console.error('Error al limpiar mensajes:', msgError)
  }
    
  // Limpiar webhooks antiguos
  const { error: webError } = await supabaseAdmin
    .from('webhook_dedupe')
    .delete()
    .in('status', ['PROCESSED', 'FAILED'])
    .lt('created_at', sevenDaysAgo)
    
  if (webError) {
    console.error('Error al limpiar webhooks:', webError)
  }
    
  console.log('🧹 Limpieza de datos antiguos completada')
}
