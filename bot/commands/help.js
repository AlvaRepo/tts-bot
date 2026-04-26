// =============================
// Comandos: help
// =============================

export async function helpHandler({ config, reply }) {
  const cmds = Object.keys(config.commandPermissions ?? {})
  const commandList = cmds.map(c => `!${c}`).join(', ')
  const response = `
Que hace: Lista todos los comandos disponibles.
Como usar: Escribe !help en el chat.
Que esperar: Una lista separada por comas de todos los comandos disponibles.
Ejemplo: !help -> "Comandos: ${commandList}"
  `.trim()

  await reply(response)
  return { handled: true, action: 'help' }
}