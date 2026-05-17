// =============================
// Comandos: help
// =============================

export async function helpHandler({ config, reply }) {
  const msg = "🎤 Comandos: !tts <texto> | !decir <texto> | !tomas | !elena | !dalia para mudar voz"
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
  tts: '!tts hola (usa !tomas, !elena, !dalia para mudar voz)',
  decir: '!decir hola (dice: "<usuario> dice: ...")',
  voice: 'Cambia la voz',
  voices: 'Lista de voces',
  queue: 'Mensajes en cola'
}

export async function helpextraHandler({ config, reply }) {
  const lines = [
    '!tts <texto> - Reproduce TTS',
    '!decir <texto> - Reproduce TTS diciendo tu nombre',
    '!tomas hola - TTS con voz de Tomas',
    '!elena hola - TTS con voz de Elena',
    '!dalia hola - TTS con voz de Dalia',
    '!voice tomas - Cambia voz por defecto',
    '!voices - Ver todas las voces',
    '!status - Estado del bot'
  ]
  await reply("📋 " + lines.join(' | '))
  return { handled: true, action: 'helpextra' }
}
