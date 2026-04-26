// =============================
// Comandos: status
// =============================

export async function statusHandler({ queue, reply }) {
  const snap = queue.snapshot()
  const stateMessage = snap.state === 'playing'
    ? `🎤 Reproduciendo`
    : `🎤 Idle`
  
  const response = `
Que hace: Muestra el estado actual del bot de TTS.
Como usar: Escribe !status en el chat.
Que esperar: Información sobre si el bot está reproduciendo o inactivo, y cuántos elementos hay en la cola.
Ejemplo: !status -> "${stateMessage} | Cola: ${snap.pendingCount}"
  `.trim()

  await reply(response)
  return { handled: true, action: 'status' }
}