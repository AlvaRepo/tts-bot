import { existsSync, mkdirSync } from 'fs'
import { writeFile, rename, unlink } from 'fs/promises'
import { join } from 'path'
import { getTtsVoicePreference, getTtsPresetPreference, TTS_EMOTION_PRESETS } from './supabase-db.js'
import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts'

const CACHE_DIR = process.env.AUDIO_CACHE_DIR ?? './audio_cache'
const VOICE = process.env.TTS_VOICE ?? 'es-AR-TomasNeural'

if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true })

/**
 * Construye el SSML con los ajustes de prosodia (rate, volume, pitch)
 */
function buildSSML(voice, text, preset) {
  let ssml = `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="es-AR">`
  ssml += `<voice name="${voice}">`
  
  const hasProsody = preset.rate || preset.volume || preset.pitch
  if (hasProsody) {
    ssml += `<prosody`
    if (preset.rate) ssml += ` rate="${preset.rate}"`
    if (preset.volume) ssml += ` volume="${preset.volume}"`
    if (preset.pitch) ssml += ` pitch="${preset.pitch}"`
    ssml += `>${text}</prosody>`
  } else {
    ssml += `>${text}`
  }
  
  ssml += `</voice></speak>`
  return ssml
}

/**
 * Escribe un archivo MP3 mock para testing
 */
async function writeMockMp3(outPath, text) {
  const header = Buffer.from(`MOCK-TTS:${text}\n`)
  const filler = Buffer.alloc(Math.max(1024, 2048 - header.length), 0)
  await writeFile(outPath, Buffer.concat([header, filler]))
}

/**
 * Sintetiza texto y devuelve la ruta absoluta del archivo .mp3.
 * Lanza Error si falla.
 */
export async function synthesize(id, text) {
  const outPath = join(CACHE_DIR, `${id}.mp3`)
  
  // Si está en modo MOCK manual, usamos mock
  if (process.env.TTS_MOCK === '1') {
    console.log('🤖 Modo MOCK manual activado')
    await writeMockMp3(outPath, text)
    return outPath
  }

  const voice = getTtsVoicePreference?.() ?? VOICE
  const presetKey = getTtsPresetPreference?.() ?? 'neutral'
  const preset = TTS_EMOTION_PRESETS[presetKey] ?? TTS_EMOTION_PRESETS.neutral
  
  try {
    const tts = new MsEdgeTTS()
    
    // Configurar voz y formato de audio
    await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3)
    
    // Construir SSML con presets de emoción
    const ssml = buildSSML(voice, text, preset)
    
    // rawToFile acepta SSML personalizado y guarda en el directorio
    const { audioFilePath } = await tts.rawToFile(CACHE_DIR, ssml)
    
    // Renombrar al archivo con el ID esperado
    await rename(audioFilePath, outPath)
    
    return outPath
  } catch (error) {
    const message = error?.message || 'msedge-tts falló'
    throw new Error(`TTS no disponible: ${message}`)
  }
}
