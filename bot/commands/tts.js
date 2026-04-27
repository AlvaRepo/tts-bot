// =============================
// Comandos: tts
// =============================

// Mapeo de aliases de voces
const VOICE_ALIASES = {
  tomas: 'es-AR-TomasNeural',
  elena: 'es-AR-ElenaNeural',
  alvaro: 'es-ES-AlvaroNeural',
  elvira: 'es-ES-ElviraNeural',
  jorge: 'es-MX-JorgeNeural',
  dalia: 'es-MX-DaliaNeural',
  guy: 'en-US-GuyNeural',
  jenny: 'en-US-JennyNeural'
}

export async function ttsHandler({ parsed, event, enqueueMessage, reply, setTtsVoicePreference }) {
  const fullText = parsed.args.join(' ').trim()
  if (!fullText) {
    await reply("❌ !tts <texto> | !elena hola para mudar voz")
    return { handled: true, error: 'missing text' }
  }

  // Detectar si el primer argumento es un alias de voz
  const firstWord = fullText.split(' ')[0].toLowerCase()
  const voiceKey = VOICE_ALIASES[firstWord]
  
  let textToSpeak = fullText
  let voiceUsed = null
  
  if (voiceKey) {
    // Cambiar la voz según el alias
    textToSpeak = fullText.slice(firstWord.length).trim()
    if (textToSpeak) {
      voiceUsed = setTtsVoicePreference(voiceKey)
    } else {
      // Si solo puso el alias sin texto, solo cambiar la voz
      setTtsVoicePreference(voiceKey)
      await reply(`🎤 Voz: ${voiceKey}`)
      return { handled: true, action: 'voice', voice: voiceKey }
    }
  }

  if (!textToSpeak) {
    await reply("❌ Escribe el texto a reproducir")
    return { handled: true, error: 'missing text' }
  }

  // Agregar a la cola SIN enviar nada al chat
  enqueueMessage({
    source: 'command',
    donor_name: event?.username ?? null,
    amount: null,
    text: textToSpeak,
    voice: voiceUsed
  })

  // No responder al chat - solo reproducir el audio
  return { handled: true, action: 'tts' }
}