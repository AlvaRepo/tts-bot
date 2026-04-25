// =============================
// Comandos: help
// =============================

export async function helpHandler({ config, reply }) {
  const cmds = Object.keys(config.commandPermissions ?? {})
  await reply(`Comandos: ${cmds.map(c => `!${c}`).join(', ')}`)
  return { handled: true, action: 'help' }
}