// =============================
// Comandos: status
// =============================

export async function statusHandler({ queue, reply }) {
  const snap = queue.snapshot()
  const msg = snap.state === 'playing'
    ? `🎤 Reproduciendo | Cola: ${snap.pendingCount}`
    : `🎤 Idle | Cola: ${snap.pendingCount}`
  await reply(msg)
  return { handled: true, action: 'status' }
}