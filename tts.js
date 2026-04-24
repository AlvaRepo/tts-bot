import { execFile } from 'child_process'
import { promisify } from 'util'
import { existsSync, mkdirSync } from 'fs'
import { writeFile } from 'fs/promises'
import { join } from 'path'
import { getTtsVoicePreference, getTtsPresetPreference, TTS_EMOTION_PRESETS } from './supabase-db.js'

const execFileAsync = promisify(execFile)
const CACHE_DIR = process.env.AUDIO_CACHE_DIR ?? './audio_cache'
const VOICE = process.env.TTS_VOICE ?? 'es-AR-TomasNeural'

if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true })

async function tryCommand(command, args, timeout = 10_000) {
  return execFileAsync(command, args, { timeout })
}

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
  const args = ['--voice', voice || VOICE, '--text', text, '--write-media', outPath]

  if (preset.rate) args.push('--rate', preset.rate)
  if (preset.volume) args.push('--volume', preset.volume)
  if (preset.pitch) args.push('--pitch', preset.pitch)
  const attempts = [
    ['edge-tts', args],
    ['python3', ['-m', 'edge_tts', ...args]],
    ['python', ['-m', 'edge_tts', ...args]]
  ]

  let lastError = null
  for (const [command, commandArgs] of attempts) {
    try {
      await tryCommand(command, commandArgs)
      return outPath
    } catch (error) {
      lastError = error
      if (error?.code !== 'ENOENT' && error?.killed !== true) break
    }
  }

  const message = lastError?.stderr?.toString?.().trim?.() || lastError?.message || 'edge-tts no disponible'
  throw new Error(`TTS no disponible: ${message}`)
}
