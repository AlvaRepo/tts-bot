// =============================
// Comandos: tts
// =============================

export async function ttsHandler({ parsed, event, enqueueMessage, reply }) {
  const text = parsed.args.join(' ').trim()
  if (!text) {
    await reply("❌ Escribe !tts <texto>")
    return { handled: true, error: 'missing text' }
  }

  const result = enqueueMessage({
    source: 'command',
    donor_name: event?.username ?? null,
    amount: null,
    text
  })

  await reply(`📢 "${text.slice(0, 80)}${text.length > 80 ? '...' : ''}" en cola`)
  return { handled: true, action: 'tts', id: result.id }
}