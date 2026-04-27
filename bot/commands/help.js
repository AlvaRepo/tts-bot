// =============================
// Comandos: help
// =============================

export async function helpHandler({ config, reply }) {
  console.log('[help] Starting...')
  const cmds = Object.keys(config.commandPermissions ?? {})
  console.log('[help] Commands from config:', cmds)
  const commandList = cmds.map(c => `!${c}`).join(', ')
  const response = `
Que hace: Lista todos los comandos disponibles.
Como usar: Escribe !help en el chat.
Que esperar: Una lista separada por comas de todos los comandos disponibles.
Ejemplo: !help -> "Comandos: ${commandList}"
  `.trim()

  console.log('[help] Calling reply with:', response.substring(0, 50))
  await reply(response)
  console.log('[help] Done')
  return { handled: true, action: 'help' }
}