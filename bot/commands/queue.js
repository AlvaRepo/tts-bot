// =============================
// Comandos: queue - estado detallado de la cola
// =============================

export async function queueHandler({ queue, reply }) {
  const snap = queue.snapshot()
  
  let msg = ''
  if (snap.state === 'playing') {
    msg = `▶️ Reproduciendo ahora | Cola: ${snap.pendingCount}`
  } else if (snap.state === 'paused') {
    msg = `⏸️ Pausado | Cola: ${snap.pendingCount}`
  } else if (snap.pendingCount > 0) {
    msg = `📋 ${snap.pendingCount} mensaje(s) en cola`
  } else {
    msg = `✅ Cola vacía`
  }
  
  await reply(msg)
  return { handled: true, action: 'queue' }
}