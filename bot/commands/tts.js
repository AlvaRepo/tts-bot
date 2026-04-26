// =============================
// Comandos: tts
// =============================

export async function ttsHandler({ parsed, event, enqueueMessage, reply }) {
  const text = parsed.args.join(' ').trim()
  if (!text) {
    const response = `
Que hace: Intenta reproducir texto mediante TTS pero falla porque no se proporcionó texto.
Como usar: !tts <texto que quieres reproducir>
Que esperar: Un mensaje de error indicando que falta texto.
Ejemplo: !tts Hola mundo -> reproduce "Hola mundo"
    `.trim()

    await reply(response)
    return { handled: true, error: 'missing text' }
  }

  const result = enqueueMessage({
    source: 'webhook',
    donor_name: event?.username ?? null,
    amount: null,
    text
  })

  const response = `
Que hace: Añade tu texto a la cola de reproducción de TTS.
Como usar: !tts <tu mensaje>
Que esperar: Confirma que el texto ha sido añadido a la cola y muestra una vista previa (primeros 100 caracteres).
Ejemplo: !tts ¡Hola, mundo! -> "${text.slice(0, 100)}" en cola
  `.trim()

  await reply(response)
  return { handled: true, action: 'tts', id: result.id }
}