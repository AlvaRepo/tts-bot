// =============================
// Comandos: voices - lista voces disponibles
// =============================

import { AVAILABLE_TTS_VOICES } from '../../supabase-db.js'

export async function voicesHandler({ reply }) {
  const voices = AVAILABLE_TTS_VOICES.slice(0, 12)
  await reply("🎤 " + voices.join(' · '))
  return { handled: true, action: 'voices' }
}