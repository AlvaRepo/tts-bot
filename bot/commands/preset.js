// =============================
// Comandos: preset
// =============================

export async function presetHandler({ parsed, setTtsPresetPreference, reply }) {
  const preset = parsed.args[0] ?? ''
  if (!preset) {
    const response = `
Que hace: Intenta cambiar el preset de TTS pero falla porque no se proporcionó un nombre de preset.
Como usar: !preset <nombre del preset>
Que esperar: Un mensaje de error indicando que falta el nombre del preset.
Ejemplo: !preset happy
    `.trim()

    await reply(response)
    return { handled: true, action: 'preset', error: 'missing preset' }
  }

  const saved = setTtsPresetPreference(preset)

  const response = `
Que hace: Cambia el preset de voz utilizado para la reproducción de TTS (ajusta características como velocidad, tono, etc.).
Como usar: !preset <nombre del preset>
Que esperar: Confirma que el preset ha sido cambiado y muestra el nombre del preset seleccionado.
Ejemplo: !preset happy -> 🎭 Preset: ${saved}
  `.trim()

  await reply(response)
  return { handled: true, action: 'preset', preset: saved }
}