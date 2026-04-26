// =============================
// Comandos: replay
// =============================

function findMessageByIdOrPrefix(history, idOrPrefix) {
  const needle = typeof idOrPrefix === 'string' ? idOrPrefix.trim() : ''
  if (!needle) return null
  return history.find(m => m.id === needle || m.id.startsWith(needle)) ?? null
}

export async function replayHandler({ parsed, enqueueMessage, getHistory, reply }) {
  const target = parsed.args[0]?.toLowerCase() === 'last'
    ? getHistory(200)[0]
    : findMessageByIdOrPrefix(getHistory(200), parsed.args[0])

  if (!target) {
    const response = `
Que hace: Intenta reproducir nuevamente un mensaje anterior de la cola pero falla porque no se encontró el mensaje.
Como usar: !replay <id o prefix del mensaje> o !replay last
Que esperar: Un mensaje de error indicando que no se encontró el mensaje especificado.
Ejemplo: !replay abc123 -> "❌ Mensaje no encontrado"
    `.trim()

    await reply(response)
    return { handled: true, action: 'replay', error: 'not found' }
  }

  const replay = enqueueMessage({
    source: target.source,
    donor_name: target.donor_name,
    amount: target.amount,
    text: target.text
  })

  const response = `
Que hace: Vuelve a colocar en cola un mensaje anterior para reproducirlo nuevamente.
Como usar: !replay <id o prefix del mensaje> o !replay last
Que esperar: El mensaje especificado se añade nuevamente al final de la cola de reproducción.
Ejemplo: !replay last -> "🔄 Mensaje reencolado"
  `.trim()

  await reply(response)
  return { handled: true, action: 'replay', id: replay.id, replay_of: target.id }
}