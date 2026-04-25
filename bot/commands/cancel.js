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
    await reply('❌ Mensaje no encontrado')
    return { handled: true, action: 'cancel', error: 'not found' }
  }

  queue.discard?.(target.id, 'CANCELLED_BY_BOT')
  await reply('🚫 Mensaje cancelado')
  return { handled: true, action: 'cancel', id: target.id }
}