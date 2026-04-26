// =============================
// Comandos: cancel
// =============================

function findMessageByIdOrPrefix(history, idOrPrefix) {
  const needle = typeof idOrPrefix === 'string' ? idOrPrefix.trim() : ''
  if (!needle) return null
  return history.find(m => m.id === needle || m.id.startsWith(needle)) ?? null
}

export async function cancelHandler({ parsed, queue, getHistory, reply }) {
  const target = findMessageByIdOrPrefix(getHistory(200), parsed.args[0])

  if (!target) {
    const response = `
Que hace: Intenta cancelar un mensaje de la cola pero falla porque no se encontró el mensaje.
Como usar: !cancel <id o prefix del mensaje>
Que esperar: Un mensaje de error indicando que no se encontró el mensaje especificado.
Ejemplo: !cancel abc123 -> "❌ Mensaje no encontrado"
    `.trim()

    await reply(response)
    return { handled: true, action: 'cancel', error: 'not found' }
  }

  queue.discard?.(target.id, 'CANCELLED_BY_BOT')

  const response = `
Que hace: Cancela un mensaje específico de la cola de reproducción.
Como usar: !cancel <id o prefix del mensaje>
Que esperar: El mensaje especificado se elimina de la cola y ya no será reproducido (similar a eliminar pero con motivo de cancelación).
Ejemplo: !cancel abc123 -> "🚫 Mensaje cancelado"
  `.trim()

  await reply(response)
  return { handled: true, action: 'cancel', id: target.id }
}