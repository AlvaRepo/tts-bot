// =============================
// Comandos: status
// =============================

export async function statusHandler({ queue, reply }) {
  const snap = queue.snapshot()
  const stateMessage = snap.state === 'playing'
    ? `🎤 Reproduciendo`
    : `🎤 Idle`
  
  const response = `${stateMessage} | Cola: ${snap.pendingCount}`
  await reply(response)
  return { handled: true, action: 'status' }
}