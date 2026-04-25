// =============================
// Comandos: preset
// =============================

export async function presetHandler({ parsed, setTtsPresetPreference, reply }) {
  const preset = parsed.args[0] ?? ''
  if (!preset) {
    await reply('❌ Falta nombre del preset')
    return { handled: true, action: 'preset', error: 'missing preset' }
  }

  const saved = setTtsPresetPreference(preset)
  await reply(`🎭 Preset: ${saved}`)
  return { handled: true, action: 'preset', preset: saved }
}