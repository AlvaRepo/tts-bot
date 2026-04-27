// =============================
// Comandos: help
// =============================

export async function helpHandler({ config, reply }) {
  await reply("test")
  return { handled: true, action: 'help' }
}

// =============================
// Comandos: helpextra
// =============================

const COMMAND_HELP = {
  help: 'Lista comandos disponibles',
  helpextra: 'Info detallada de cada comando',
  status: 'Muestra estado del TTS y cola',
  tts: '!tts <texto> - Agrega texto a la cola',
  voice: '!voice <nombre> - Cambia la voz',
  voices: 'Lista voces disponibles',
  queue: 'Muestra la cola de mensajes',
  skip: 'Saltea el mensaje actual',
  replay: '!replay [id] - Repite un mensaje',
  delete: '!delete <id> - Borra un mensaje',
  cancel: 'Cancela tu mensaje en cola',
  restore: 'Restaura ultimo mensaje borrado',
  preset: '!preset <nombre> - Guarda/carga preset',
  quote: 'Quote random del chat',
  randomquote: 'Quote random del chat',
  lurk: 'Muestra que estas de Lurker',
  pokemon: 'Datos de un Pokemon',
  uptime: 'Tiempo del stream'
}

export async function helpextraHandler({ config, reply }) {
  const cmds = Object.keys(config.commandPermissions ?? {})
  const lines = cmds.map(cmd => {
    const desc = COMMAND_HELP[cmd] || 'Sin descripcion'
    return `!${cmd}: ${desc}`
  })
  await reply(lines.join(' | '))
  return { handled: true, action: 'helpextra' }
}