// =============================
// Comandos: skip
// =============================

export async function skipHandler({ queue, reply }) {
  queue.control('skip')

  const response = `
Que hace: Salta el mensaje actual en la cola de reproducción y pasa al siguiente.
Como usar: !skip en el chat.
Que esperar: El mensaje actual se omite y comienza a reproducirse el siguiente en la cola (si existe).
Ejemplo: !skip -> "⏭️ Mensaje saltado"
  `.trim()

  await reply(response)
  return { handled: true, action: 'skip' }
}