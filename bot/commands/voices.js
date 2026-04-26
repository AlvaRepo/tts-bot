// =============================
// Comandos: voices - lista voces disponibles
// =============================

import { AVAILABLE_TTS_VOICES } from '../../supabase-db.js'

export async function voicesHandler({ reply }) {
  const voices = AVAILABLE_TTS_VOICES.slice(0, 15)
  const voiceList = voices.join(', ')
  const hasMore = AVAILABLE_TTS_VOICES.length > 15
  const response = `
Que hace: Lista las voces disponibles para el sistema de TTS.
Como usar: !voices en el chat.
Que esperar: Una lista de voces disponibles (máximo 15 mostradas, con indicación si hay más).
Ejemplo: !voices -> "🎤 Voces: ${voiceList}${hasMore ? '...' : ''}"
  `.trim()

  await reply(response)
  return { handled: true, action: 'voices' }
}