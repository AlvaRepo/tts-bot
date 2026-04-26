// =============================
// Comandos: lurk
// =============================

export async function lurkHandler({ reply }) {
  const response = `
Que hace: Alterna tu estado de espectador (lurker) en el chat.
Como usar: !lurk en el chat.
Que esperar: Si estabas participando activamente, pasarás a modo espectador (tus mensajes no activarán TTS). Si ya estabas en modo espectador, volverás a participar normalmente.
Ejemplo: !lurk -> "Ahora estás en modo espectador" o "Ya no estás en modo espectador"
  `.trim()

  await reply(response)
  return { handled: true, action: 'lurk' }
}