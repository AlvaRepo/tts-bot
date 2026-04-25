// =============================
// Exports públicos del Bot
// =============================

export { createRouter } from './router.js'
export { canUseCommand, normalizeRole, normalizeCommand, getAvailableCommands, getAllowedRoles } from './permissions.js'
export { parseBotCommand } from './parser.js'
export { commandHandlers } from './commands/index.js'
export { createPluginManager } from './plugins/index.js'
export { createPinnedPlugin } from './plugins/pinned.js'
export { createPollPlugin } from './plugins/poll.js'