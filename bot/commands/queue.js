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
    stateMessage = `📋 ${snap.pendingCount} mensaje(s) en cola`
  } else {
    stateMessage = '✅ Cola vacía'
  }

  const response = `
Que hace: Muestra el estado actual de la cola de reproducción.
Como usar: !queue en el chat.
Que esperar: Información sobre el estado de reproducción (reproduciendo, pausado, etc.) y el número de elementos en la cola.
Ejemplo: !queue -> "${stateMessage}"
  `.trim()

  await reply(response)
  return { handled: true, action: 'queue' }
}