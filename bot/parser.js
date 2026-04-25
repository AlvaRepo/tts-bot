// =============================
// Parser de comandos
// =============================

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : ''
}

export function parseBotCommand(text, prefix = '!') {
  const raw = normalizeText(text)
  if (!raw.startsWith(prefix)) return null

  const [command, ...args] = raw.slice(prefix.length).split(/\s+/)

  return {
    command: command ? command.toLowerCase() : '',
    args: args.filter(Boolean),
    raw
  }
}