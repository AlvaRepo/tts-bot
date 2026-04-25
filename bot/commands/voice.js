// =============================
// Comandos: voice
// =============================

export async function voiceHandler({ parsed, setTtsVoicePreference, reply }) {
  const voice = parsed.args.join(' ').trim()
  if (!voice) {
    await reply('❌ Falta nombre de voz')
    return { handled: true, error: 'missing voice' }
  }

  const saved = setTtsVoicePreference(voice)
  await reply(`🎭 Voz: ${saved}`)
  return { handled: true, action: 'voice', voice: saved }
}