// =============================
// Comandos: voice
// =============================

export async function voiceHandler({ parsed, setTtsVoicePreference }) {
  const voice = parsed.args.join(' ').trim()
  if (!voice) {
    return { handled: true, error: 'missing voice' }
  }

  setTtsVoicePreference(voice)
  // No responde al chat - solo cambia la voz
  return { handled: true, action: 'voice', voice }
}