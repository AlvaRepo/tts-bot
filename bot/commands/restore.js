// =============================
// Comandos: restore
// =============================

function findMessageByIdOrPrefix(history, idOrPrefix) {
  const needle = typeof idOrPrefix === 'string' ? idOrPrefix.trim() : ''
  if (!needle) return null
  return history.find(m => m.id === needle || m.id.startsWith(needle)) ?? null
}

export async function restoreHandler({ parsed, enqueueMessage, getHistory, reply }) {
  const target = findMessageByIdOrPrefix(getHistory(200), parsed.args[0])

  if (!target) {
    const response = `
Que hace: Intenta restaurar un mensaje eliminado/cancelado a la cola pero falla porque no se encontró el mensaje.
Como usar: !restore <id o prefix del mensaje>
Que esperar: Un mensaje de error indicando que no se encontró el mensaje especificado.
Ejemplo: !restore abc123 -> "❌ Mensaje no encontrado"
    `.trim()

    await reply(response)
    return { handled: true, action: 'restore', error: 'not found' }
  }

  const restored = enqueueMessage({
    source: target.source,
    donor_name: target.donor_name,
    amount: target.amount,
    text: target.text
  })

  const response = `
Que hace: Restaura un mensaje previamente eliminado o cancelado colocándolo nuevamente al final de la cola de reproducción.
Como usar: !restore <id o prefix del mensaje>
Que esperar: El mensaje especificado se añade nuevamente a la cola y estará disponible para reproducción.
Ejemplo: !restore abc123 -> "♻️ Mensaje restaurado a la cola"
  `.trim()

  await reply(response)
  return { handled: true, action: 'restore', id: restored.id, restored_from: target.id }
}