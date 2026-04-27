// =============================
// Comandos: queue - estado detallado de la cola
// =============================

export async function queueHandler({ queue, reply }) {
  const snap = queue.snapshot()
   
  let stateMessage = ''
  if (snap.state === 'playing') {
    stateMessage = '▶️ Reproduciendo ahora'
  } else if (snap.state === 'paused') {
    stateMessage = '⏸️ Pausado'
  } else if (snap.pendingCount > 0) {
    stateMessage = `📋 ${snap.pendingCount} en cola`
  } else {
    stateMessage = '✅ Cola vacía'
  }

  await reply(stateMessage)
  return { handled: true, action: 'queue' }
}