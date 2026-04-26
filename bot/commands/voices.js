// =============================
// Comandos: voices - lista voces disponibles
// =============================

import { AVAILABLE_TTS_VOICES } from '../../supabase-db.js'

export async function voicesHandler({ reply }) {
  const voices = AVAILABLE_TTS_VOICES.slice(0, 15)
  await reply(`🎤 Voces: ${voices.join(', ')}${AVAILABLE_TTS_VOICES.length > 15 ? '...' : ''}`)
  return { handled: true, action: 'voices' }
}