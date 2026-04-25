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
    await reply('❌ Mensaje no encontrado')
    return { handled: true, action: 'restore', error: 'not found' }
  }

  const restored = enqueueMessage({
    source: target.source,
    donor_name: target.donor_name,
    amount: target.amount,
    text: target.text
  })

  await reply('♻️ Mensaje restaurado a la cola')
  return { handled: true, action: 'restore', id: restored.id, restored_from: target.id }
}