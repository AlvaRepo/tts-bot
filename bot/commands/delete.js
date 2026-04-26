// =============================
// Comandos: delete
// =============================

function findMessageByIdOrPrefix(history, idOrPrefix) {
  const needle = typeof idOrPrefix === 'string' ? idOrPrefix.trim() : ''
  if (!needle) return null
  return history.find(m => m.id === needle || m.id.startsWith(needle)) ?? null
}

export async function deleteHandler({ parsed, queue, deleteMessage, getHistory, reply }) {
  const target = findMessageByIdOrPrefix(getHistory(200), parsed.args[0])

  if (!target) {
    const response = `
Que hace: Intenta eliminar un mensaje de la cola pero falla porque no se encontró el mensaje.
Como usar: !delete <id o prefix del mensaje>
Que esperar: Un mensaje de error indicando que no se encontró el mensaje especificado.
Ejemplo: !delete abc123 -> "❌ Mensaje no encontrado"
    `.trim()

    await reply(response)
    return { handled: true, action: 'delete', error: 'not found' }
  }

  queue.discard?.(target.id, 'DELETED')
  deleteMessage(target.id)

  const response = `
Que hace: Elimina un mensaje específico de la cola de reproducción.
Como usar: !delete <id o prefix del mensaje>
Que esperar: El mensaje especificado se elimina de la cola y ya no será reproducido.
Ejemplo: !delete abc123 -> "🗑️ Mensaje eliminado"
  `.trim()

  await reply(response)
  return { handled: true, action: 'delete', id: target.id }
}