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
    await reply('❌ Mensaje no encontrado')
    return { handled: true, action: 'delete', error: 'not found' }
  }

  queue.discard?.(target.id, 'DELETED')
  deleteMessage(target.id)

  await reply('🗑️ Mensaje eliminado')
  return { handled: true, action: 'delete', id: target.id }
}