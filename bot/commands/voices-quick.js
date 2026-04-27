// =============================
// Comandos de voz rápida: !tomas, !elena, !dalia, etc.
// =============================

const VOICE_ALIASES = {
  Tomas: 'es-AR-TomasNeural',
  Elena: 'es-AR-ElenaNeural',
  Alvaro: 'es-ES-AlvaroNeural',
  Elvira: 'es-ES-ElviraNeural',
  Jorge: 'es-MX-JorgeNeural',
  Dalia: 'es-MX-DaliaNeural',
  Guy: 'en-US-GuyNeural',
  Jenny: 'en-US-JennyNeural'
}

// Crear handlers para cada voz
const voiceCommandHandlers = {}

for (const [name, voice] of Object.entries(VOICE_ALIASES)) {
  voiceCommandHandlers[name.toLowerCase()] = {
    voice,
    handler: async function({ parsed, event, enqueueMessage, setTtsVoicePreference }) {
      const text = parsed.args?.join(' ')?.trim() || ''
      
      // Cambiar la voz
      setTtsVoicePreference(voice)
      
      if (!text) {
        // Solo cambió la voz - no responde al chat
        return { handled: true, action: 'voice', voice: name }
      }
      
      // Cambiar voz y reproducir - NO responde al chat
      enqueueMessage({
        source: 'command',
        donor_name: event?.username ?? null,
        amount: null,
        text
      })
      
      return { handled: true, action: 'tts' }
    }
  }
}

// Exportar todos los handlers
export const voiceHandlers = voiceCommandHandlers