// =============================
// Comandos: tts
// =============================

export async function ttsHandler({ parsed, event, enqueueMessage, reply }) {
  const text = parsed.args.join(' ').trim()
  if (!text) {
    await reply('❌ Falta texto para reproducir')
    return { handled: true, error: 'missing text' }
  }

  const result = enqueueMessage({
    source: 'webhook',
    donor_name: event?.username ?? null,
    amount: null,
    text
  })

  await reply(`🎤 "${text.slice(0, 100)}" en cola`)
  return { handled: true, action: 'tts', id: result.id }
}