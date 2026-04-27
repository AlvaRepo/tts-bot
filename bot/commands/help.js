// =============================
// Comandos: help
// =============================

export async function helpHandler({ config, reply }) {
  const msg = "🎤 Comandos: !tts <texto> | !voice | !voices | !status"
  const result = await reply(msg)
  return { handled: true, action: 'help' }
}

// =============================
// Comandos: helpextra
// =============================

const COMMAND_HELP = {
  help: 'Lista comandos básicos',
  helpextra: 'Todos los comandos',
  status: 'Estado del TTS',
  tts: 'Agrega texto a la cola',
  voice: 'Cambia la voz',
  voices: 'Lista de voces',
  queue: 'Mensajes en cola'
}

export async function helpextraHandler({ config, reply }) {
  const cmds = Object.keys(config.commandPermissions ?? {}).slice(0, 10)
  const lines = cmds.map(cmd => {
    const desc = COMMAND_HELP[cmd] || cmd
    return `!${cmd}`
  })
  await reply("📋 " + lines.join(' | '))
  return { handled: true, action: 'helpextra' }
}