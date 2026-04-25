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
    await reply('❌ Mensaje no encontrado')
    return { handled: true, action: 'replay', error: 'not found' }
  }

  const replay = enqueueMessage({
    source: target.source,
    donor_name: target.donor_name,
    amount: target.amount,
    text: target.text
  })

  await reply('🔄 Mensaje reencolado')
  return { handled: true, action: 'replay', id: replay.id, replay_of: target.id }
}