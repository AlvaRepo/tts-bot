// =============================
// Comandos: skip
// =============================

export async function skipHandler({ queue, reply }) {
  queue.control('skip')
  await reply('⏭️ Mensaje saltado')
  return { handled: true, action: 'skip' }
}