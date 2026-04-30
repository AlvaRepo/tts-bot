// =============================
// Mapa de handlers
// =============================

import { helpHandler, helpextraHandler } from './help.js'
import { statusHandler } from './status.js'
import { ttsHandler } from './tts.js'
import { voiceHandler } from './voice.js'
import { voicesHandler } from './voices.js'
import { queueHandler } from './queue.js'
import { skipHandler } from './skip.js'
import { replayHandler } from './replay.js'
import { deleteHandler } from './delete.js'
import { cancelHandler } from './cancel.js'
import { restoreHandler } from './restore.js'
import { presetHandler } from './preset.js'
import { pokemonHandler } from './pokemon.js'
import { uptimeHandler } from './uptime.js'
import { quoteHandler } from './quote.js'
import { randomquoteHandler } from './randomquote.js'
import { lurkHandler } from './lurk.js'
import { voiceHandlers } from './voices-quick.js'
import { gatitoHandler, gatitoInfoHandler } from './cat.js'

export { helpHandler, helpextraHandler, statusHandler, ttsHandler, voiceHandler, voicesHandler, queueHandler, skipHandler, replayHandler, deleteHandler, cancelHandler, restoreHandler, presetHandler, pokemonHandler, uptimeHandler, quoteHandler, randomquoteHandler, lurkHandler }

export const commandHandlers = {
  help: helpHandler,
  helpextra: helpextraHandler,
  status: statusHandler,
  tts: ttsHandler,
  voice: voiceHandler,
  voices: voicesHandler,
  queue: queueHandler,
  skip: skipHandler,
  replay: replayHandler,
  delete: deleteHandler,
  cancel: cancelHandler,
  restore: restoreHandler,
  preset: presetHandler,
  pokemon: pokemonHandler,
  uptime: uptimeHandler,
  quote: quoteHandler,
  randomquote: randomquoteHandler,
  lurk: lurkHandler,
  gatito: gatitoHandler,
  gatitoInfo: gatitoInfoHandler,
  // Comandos de voz rápida
  tomas: voiceHandlers.tomas.handler,
  elena: voiceHandlers.elena.handler,
  alvaro: voiceHandlers.alvaro.handler,
  elvira: voiceHandlers.elvira.handler,
  jorge: voiceHandlers.jorge.handler,
  dalia: voiceHandlers.dalia.handler,
  guy: voiceHandlers.guy.handler,
  jenny: voiceHandlers.jenny.handler
}