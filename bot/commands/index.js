// =============================
// Mapa de handlers
// =============================

import { helpHandler } from './help.js'
import { statusHandler } from './status.js'
import { ttsHandler } from './tts.js'
import { voiceHandler } from './voice.js'
import { skipHandler } from './skip.js'
import { replayHandler } from './replay.js'
import { deleteHandler } from './delete.js'
import { cancelHandler } from './cancel.js'
import { restoreHandler } from './restore.js'
import { presetHandler } from './preset.js'
import { pokemonHandler } from './pokemon.js'

export { helpHandler, statusHandler, ttsHandler, voiceHandler, skipHandler, replayHandler, deleteHandler, cancelHandler, restoreHandler, presetHandler, pokemonHandler }

export const commandHandlers = {
  help: helpHandler,
  status: statusHandler,
  tts: ttsHandler,
  voice: voiceHandler,
  skip: skipHandler,
  replay: replayHandler,
  delete: deleteHandler,
  cancel: cancelHandler,
  restore: restoreHandler,
  preset: presetHandler,
  pokemon: pokemonHandler
}