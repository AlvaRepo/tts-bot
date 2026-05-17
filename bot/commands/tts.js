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

function resolveTtsInput(fullText) {
  const normalized = typeof fullText === 'string' ? fullText.trim() : ''
  if (!normalized) return { voiceKey: null, textToSpeak: '' }

  const firstWord = normalized.split(' ')[0].toLowerCase()
  const voiceKey = VOICE_ALIASES[firstWord] ?? null

  if (!voiceKey) {
    return { voiceKey: null, textToSpeak: normalized }
  }

  return {
    voiceKey,
    textToSpeak: normalized.slice(firstWord.length).trim()
  }
}

function enqueueTtsMessage({ enqueueMessage, event, textToSpeak, voice }) {
  enqueueMessage({
    source: 'command',
    donor_name: event?.username ?? null,
    amount: null,
    text: textToSpeak,
    voice
  })
}

export async function ttsHandler({ parsed, event, enqueueMessage, reply, setTtsVoicePreference }) {
  const fullText = parsed.args.join(' ').trim()
  if (!fullText) {
    await reply("❌ !tts <texto> | !elena hola para mudar voz")
    return { handled: true, error: 'missing text' }
  }

  const { voiceKey, textToSpeak } = resolveTtsInput(fullText)
  let voiceUsed = null

  if (voiceKey) {
    if (textToSpeak) {
      voiceUsed = setTtsVoicePreference(voiceKey)
    } else {
      setTtsVoicePreference(voiceKey)
      await reply(`🎤 Voz: ${voiceKey}`)
      return { handled: true, action: 'voice', voice: voiceKey }
    }
  }

  if (!textToSpeak) {
    await reply("❌ Escribe el texto a reproducir")
    return { handled: true, error: 'missing text' }
  }

  enqueueTtsMessage({ enqueueMessage, event, textToSpeak, voice: voiceUsed })

  return { handled: true, action: 'tts' }
}

export async function decirHandler({ parsed, event, enqueueMessage, reply, setTtsVoicePreference }) {
  const fullText = parsed.args.join(' ').trim()
  if (!fullText) {
    await reply("❌ !tts <texto> | !elena hola para mudar voz")
    return { handled: true, error: 'missing text' }
  }

  const { voiceKey, textToSpeak } = resolveTtsInput(fullText)
  if (voiceKey) {
    if (textToSpeak) {
      setTtsVoicePreference(voiceKey)
    } else {
      setTtsVoicePreference(voiceKey)
      await reply(`🎤 Voz: ${voiceKey}`)
      return { handled: true, action: 'voice', voice: voiceKey }
    }
  }

  const spokenText = `${event?.username ?? ''} dice: ${textToSpeak}`.trim()
  if (!spokenText) {
    await reply("❌ Escribe el texto a reproducir")
    return { handled: true, error: 'missing text' }
  }

  enqueueTtsMessage({ enqueueMessage, event, textToSpeak: spokenText })
  return { handled: true, action: 'tts' }
}
