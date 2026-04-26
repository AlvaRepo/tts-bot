// =============================
// Comandos: voice
// =============================

export async function voiceHandler({ parsed, setTtsVoicePreference, reply }) {
  const voice = parsed.args.join(' ').trim()
  if (!voice) {
    const response = `
Que hace: Intenta cambiar la voz predeterminada del TTS pero falla porque no se proporcionó un nombre de voz.
Como usar: !voice <nombre de la voz>
Que esperar: Un mensaje de error indicando que falta el nombre de la voz.
Ejemplo: !voice en-US-Standard-B
    `.trim()

    await reply(response)
    return { handled: true, error: 'missing voice' }
  }

  const saved = setTtsVoicePreference(voice)

  const response = `
Que hace: Cambia la voz predeterminada utilizada para la reproducción de TTS.
Como usar: !voice <nombre de la voz>
Que esperar: Confirma que la voz ha sido cambiada y muestra el nombre de la voz seleccionada.
Ejemplo: !voice en-US-Standard-B -> Voz: ${saved}
  `.trim()

  await reply(response)
  return { handled: true, action: 'voice', voice: saved }
}