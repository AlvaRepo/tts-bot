# TTS Stream System — Agent SDD

> **Documento diseñado para ejecución autónoma por un agente de IA.**
> Cada decisión de diseño ya está tomada. No hay opciones a elegir.
> El agente ejecuta fases en orden, verifica cada una antes de avanzar, y nunca improvisa fuera de este spec.

---

## Instrucciones para el agente

1. Leer este documento completo antes de escribir una sola línea de código.
2. Ejecutar las fases en orden estricto: 1 → 2 → 3 → 4 → 5 → 6.
3. Al final de cada fase, ejecutar los **Checks de verificación** indicados. Si alguno falla, corregir antes de continuar.
4. Nunca agregar dependencias no listadas en este documento.
5. Nunca refactorizar código de fases anteriores a menos que una fase lo indique explícitamente.
6. Si una instrucción es ambigua, aplicar la opción más simple posible.
7. Al terminar todas las fases, el sistema debe pasar todos los checks sin modificaciones adicionales.

---

## Decisiones ya tomadas (no negociables)

| Decisión | Valor elegido | Razón |
|---|---|---|
| Runtime | Node.js 20 | LTS activo |
| HTTP | Express 4.18.2 | estable, conocido |
| WebSocket | ws 8.16.0 | sin overhead |
| DB | better-sqlite3 9.4.3 | síncrono, sin servidor |
| TTS | edge-tts (Python, CLI) | voz es-AR gratis, sin API key |
| Audio playback | Web Audio API en overlay | sin deps extra en Node |
| IDs | crypto.randomUUID() | nativo Node 20 |
| Puerto HTTP | 3000 | |
| Puerto WS | 3001 | |
| Caché audio | ./audio_cache/ (relativo al proyecto) | portable en Windows |
| Max texto | 300 caracteres | evitar síntesis larga |
| Max reintentos TTS | 3 | |
| Backoff reintentos | 1s, 2s, 4s | exponencial simple |
| Voz TTS | es-AR-TomasNeural | acento argentino |
| Formato audio | mp3 | compatible Web Audio API |

---

## Estructura de archivos final

El agente debe crear exactamente esta estructura, ni más ni menos:

```
tts-stream/
├── package.json
├── .env
├── server.js
├── db.js
├── queue.js
├── tts.js
├── audio_cache/          ← creado en runtime, no commitear
├── public/
│   ├── overlay.html
│   └── panel.html
└── test/
    └── smoke.js
```

---

## Schema de base de datos

Archivo: `db.js`
El agente implementa exactamente este schema, sin columnas adicionales:

```sql
CREATE TABLE IF NOT EXISTS messages (
  id          TEXT PRIMARY KEY,
  source      TEXT NOT NULL CHECK(source IN ('manual','webhook')),
  donor_name  TEXT,
  amount      REAL,
  text        TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'PENDING'
             CHECK(status IN ('PENDING','QUEUED','SYNTHESIZING','READY','PLAYING','PAUSED','DONE','FAILED','SKIPPED')),
  retries     INTEGER NOT NULL DEFAULT 0,
  audio_path  TEXT,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL,
  error_msg   TEXT
);

CREATE INDEX IF NOT EXISTS idx_status    ON messages(status);
CREATE INDEX IF NOT EXISTS idx_created   ON messages(created_at DESC);
```

---

## API HTTP — contratos exactos

### POST /api/message
Recibe mensaje nuevo (manual o webhook).

Request body:
```json
{
  "text": "string, requerido, max 300 chars",
  "source": "manual | webhook",
  "donor_name": "string | null",
  "amount": "number | null"
}
```

Response 201:
```json
{ "id": "uuid" }
```

Response 400 (validación falla):
```json
{ "error": "descripción del problema" }
```

### POST /api/control/:action
Acciones válidas: `pause` | `resume` | `stop` | `skip`
Response 200: `{ "ok": true }`
Response 400 si acción no válida: `{ "error": "invalid action" }`

### GET /api/history
Devuelve últimos 50 mensajes ordenados por `created_at DESC`.

Response 200:
```json
[
  {
    "id": "uuid",
    "text": "...",
    "source": "manual",
    "donor_name": null,
    "amount": null,
    "status": "DONE",
    "retries": 0,
    "created_at": 1712000000000,
    "error_msg": null
  }
]
```

### GET /audio/:id
Sirve el archivo mp3 de `./audio_cache/{id}.mp3`.
Response 404 si no existe.

### GET /overlay
Sirve `public/overlay.html` con header `Content-Type: text/html`.

### GET /panel
Sirve `public/panel.html` con header `Content-Type: text/html`.

---

## Eventos WebSocket — contratos exactos

El servidor emite estos eventos a todos los clientes conectados.
Formato: JSON serializado como string.

```
{ "type": "message:start",   "id": "uuid", "text": "...", "donor_name": "...", "amount": 10.0, "audioUrl": "/audio/uuid" }
{ "type": "message:done",    "id": "uuid" }
{ "type": "message:failed",  "id": "uuid", "error": "..." }
{ "type": "queue:paused" }
{ "type": "queue:resumed" }
{ "type": "queue:stopped" }
{ "type": "queue:updated",   "pending": 3 }
```

El overlay envía este evento al servidor cuando el audio termina:
```
{ "type": "audio:ended", "id": "uuid" }
```

---

## Estados del mensaje — transiciones válidas

```
PENDING → QUEUED              (cuando queue.add() lo toma)
QUEUED → SYNTHESIZING         (cuando el procesador lo saca de la cola)
SYNTHESIZING → SYNTHESIZING   (reintento, retries++)
SYNTHESIZING → READY          (síntesis exitosa)
SYNTHESIZING → FAILED         (retries === 3)
READY → PLAYING               (broadcast message:start enviado)
PLAYING → PAUSED              (control pause)
PAUSED → PLAYING              (control resume)
PLAYING → DONE                (audio:ended recibido del overlay)
PLAYING → SKIPPED             (control skip)
PAUSED → SKIPPED              (control skip)
```

Cualquier otra transición es inválida. El agente no debe implementar transiciones fuera de esta lista.

---

## Fase 1 — Setup del proyecto

### Tareas

1. Crear directorio `tts-stream/` y entrar en él.
2. Ejecutar:
```bash
npm init -y
npm install express@4.18.2 ws@8.16.0 better-sqlite3@9.4.3 dotenv@16.4.5
mkdir -p public test audio_cache
```
3. Crear `.env`:
```env
PORT=3000
WS_PORT=3001
TTS_VOICE=es-AR-TomasNeural
MAX_MESSAGE_LENGTH=300
MAX_RETRIES=3
AUDIO_CACHE_DIR=./audio_cache
```
4. Verificar que Python 3 y edge-tts estén disponibles:
```bash
python3 --version
pip3 install edge-tts
edge-tts --version
```
Si `edge-tts` no está disponible, registrar el error y continuar. El módulo `tts.js` debe manejar este caso con un error claro.

5. Agregar a `package.json`:
```json
"scripts": {
  "start": "node server.js",
  "test":  "node test/smoke.js"
}
```

### Checks fase 1
- [ ] `node -e "require('express')"` sin error
- [ ] `node -e "require('better-sqlite3')"` sin error
- [ ] `node -e "require('ws')"` sin error
- [ ] Directorio `audio_cache/` existe
- [ ] `.env` existe con las 6 variables

---

## Fase 2 — Capa de datos (`db.js`)

### Implementar exactamente estas funciones exportadas:

```js
// db.js
import Database from 'better-sqlite3'
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

let db

export function initDB() {
  db = new Database(join(__dirname, 'messages.db'))
  db.pragma('journal_mode = WAL')
  db.exec(SCHEMA)          // SCHEMA = el SQL del apartado "Schema de base de datos"
  scheduleCleanup()
  return db
}

export function insertMessage(msg) {
  // INSERT OR REPLACE INTO messages (...) VALUES (...)
  // msg tiene: id, source, donor_name, amount, text, status, retries,
  //            audio_path, created_at, updated_at, error_msg
}

export function updateMessage(id, fields) {
  // UPDATE messages SET ...fields..., updated_at = Date.now() WHERE id = ?
  // fields es un objeto parcial con solo las columnas a actualizar
}

export function getHistory(limit = 50) {
  // SELECT * FROM messages ORDER BY created_at DESC LIMIT ?
}

export function getMessage(id) {
  // SELECT * FROM messages WHERE id = ?
}

function scheduleCleanup() {
  runCleanup()
  setInterval(runCleanup, 60 * 60 * 1000)
}

function runCleanup() {
  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000
  db.prepare(`
    DELETE FROM messages
    WHERE status IN ('DONE','FAILED','SKIPPED')
      AND created_at < ?
  `).run(sevenDaysAgo)

  const { count } = db.prepare(`
    SELECT COUNT(*) as count FROM messages
    WHERE status IN ('DONE','FAILED','SKIPPED')
  `).get()

  if (count > 500) {
    db.prepare(`
      DELETE FROM messages
      WHERE status IN ('DONE','FAILED','SKIPPED')
        AND id IN (
          SELECT id FROM messages
          WHERE status IN ('DONE','FAILED','SKIPPED')
          ORDER BY created_at ASC
          LIMIT ?
        )
    `).run(count - 500)
  }
}
```

### Checks fase 2
```bash
node -e "
  import('./db.js').then(({ initDB, insertMessage, getMessage }) => {
    initDB()
    const id = crypto.randomUUID()
    insertMessage({ id, source: 'manual', donor_name: null, amount: null,
      text: 'test', status: 'PENDING', retries: 0, audio_path: null,
      created_at: Date.now(), updated_at: Date.now(), error_msg: null })
    const row = getMessage(id)
    console.assert(row.text === 'test', 'insert/get failed')
    console.log('db.js OK')
  })
"
```
- [ ] No lanza error
- [ ] Archivo `messages.db` creado en el directorio del proyecto

---

## Fase 3 — TTS Engine (`tts.js`)

### Implementar exactamente:

```js
// tts.js
import { execFile } from 'child_process'
import { promisify } from 'util'
import { existsSync, mkdirSync } from 'fs'
import { join } from 'path'

const execFileAsync = promisify(execFile)
const CACHE_DIR  = process.env.AUDIO_CACHE_DIR ?? './audio_cache'
const VOICE      = process.env.TTS_VOICE ?? 'es-AR-TomasNeural'

if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true })

/**
 * Sintetiza texto y devuelve la ruta absoluta del archivo .mp3.
 * Lanza Error si falla.
 */
export async function synthesize(id, text) {
  const outPath = join(CACHE_DIR, `${id}.mp3`)
  await execFileAsync('edge-tts', [
    '--voice', VOICE,
    '--text',  text,
    '--write-media', outPath
  ], { timeout: 10_000 })
  return outPath
}
```

> **Nota para el agente:** `edge-tts` es un comando CLI de Python instalado con pip. Se invoca como proceso hijo. Si el sistema tiene `edge-tts` como módulo Python pero no como comando global, usar `python3 -m edge_tts` en lugar de `edge-tts`.

### Checks fase 3
```bash
node -e "
  import('./tts.js').then(async ({ synthesize }) => {
    const path = await synthesize('test-001', 'Hola mundo')
    const { existsSync } = await import('fs')
    console.assert(existsSync(path), 'archivo no creado')
    console.log('tts.js OK, archivo:', path)
  }).catch(e => console.error('tts.js FAIL:', e.message))
"
```
- [ ] Archivo `audio_cache/test-001.mp3` creado
- [ ] Tamaño > 1 KB

---

## Fase 4 — Message Queue (`queue.js`)

### Implementar exactamente:

```js
// queue.js
import { synthesize }    from './tts.js'
import { updateMessage } from './db.js'

const MAX_RETRIES = parseInt(process.env.MAX_RETRIES ?? '3')

export class MessageQueue {
  #queue   = []
  #state   = 'idle'   // idle | playing | paused | stopped
  #current = null
  #resolveAudio = null
  #broadcast    = null  // función (event) => void, inyectada en init()

  init(broadcastFn) {
    this.#broadcast = broadcastFn
  }

  add(msg) {
    msg.status = 'QUEUED'
    updateMessage(msg.id, { status: 'QUEUED' })
    this.#queue.push(msg)
    this.#broadcast({ type: 'queue:updated', pending: this.#queue.length })
    if (this.#state === 'idle') this.#processNext()
  }

  audioEnded(id) {
    if (this.#current?.id === id && this.#resolveAudio) {
      this.#resolveAudio()
    }
  }

  control(action) {
    switch (action) {
      case 'pause':
        if (this.#state === 'playing') {
          this.#state = 'paused'
          this.#broadcast({ type: 'queue:paused' })
        }
        break
      case 'resume':
        if (this.#state === 'paused') {
          this.#state = 'playing'
          this.#broadcast({ type: 'queue:resumed' })
        }
        break
      case 'stop':
        this.#state = 'stopped'
        this.#queue  = []
        this.#current = null
        if (this.#resolveAudio) { this.#resolveAudio(); this.#resolveAudio = null }
        this.#broadcast({ type: 'queue:stopped' })
        break
      case 'skip':
        if (this.#current && this.#resolveAudio) {
          updateMessage(this.#current.id, { status: 'SKIPPED' })
          this.#broadcast({ type: 'message:done', id: this.#current.id })
          this.#resolveAudio()
          this.#resolveAudio = null
        }
        break
    }
  }

  get pendingCount() { return this.#queue.length }

  async #processNext() {
    if (this.#queue.length === 0 || this.#state === 'paused' || this.#state === 'stopped') {
      this.#state = 'idle'
      return
    }

    this.#current = this.#queue.shift()
    this.#state   = 'playing'
    await this.#processMessage(this.#current)
    this.#current = null
    this.#processNext()
  }

  async #processMessage(msg) {
    let audioPath = null
    let attempt   = 0

    while (attempt < MAX_RETRIES && audioPath === null) {
      updateMessage(msg.id, { status: 'SYNTHESIZING', retries: attempt })
      try {
        audioPath = await synthesize(msg.id, msg.text)
      } catch (err) {
        attempt++
        if (attempt >= MAX_RETRIES) {
          updateMessage(msg.id, { status: 'FAILED', error_msg: err.message })
          this.#broadcast({ type: 'message:failed', id: msg.id, error: err.message })
          return
        }
        await sleep(1000 * Math.pow(2, attempt - 1))
      }
    }

    updateMessage(msg.id, { status: 'PLAYING', audio_path: audioPath })
    this.#broadcast({
      type:       'message:start',
      id:         msg.id,
      text:       msg.text,
      donor_name: msg.donor_name ?? null,
      amount:     msg.amount ?? null,
      audioUrl:   `/audio/${msg.id}`
    })

    await new Promise(resolve => { this.#resolveAudio = resolve })
    this.#resolveAudio = null

    if (msg.status !== 'SKIPPED') {
      updateMessage(msg.id, { status: 'DONE' })
      this.#broadcast({ type: 'message:done', id: msg.id })
    }
  }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

export const queue = new MessageQueue()
```

### Checks fase 4
- [ ] `node -e "import('./queue.js').then(() => console.log('queue.js OK'))"` sin error
- [ ] El archivo no importa nada fuera de `tts.js`, `db.js` y módulos de Node stdlib

---

## Fase 5 — Servidor HTTP + WebSocket (`server.js`)

### Implementar exactamente:

```js
// server.js
import 'dotenv/config'
import express           from 'express'
import { createServer }  from 'http'
import { WebSocketServer } from 'ws'
import { existsSync }    from 'fs'
import { join, resolve } from 'path'
import { initDB, insertMessage, getHistory } from './db.js'
import { queue }         from './queue.js'

const PORT    = parseInt(process.env.PORT    ?? '3000')
const WS_PORT = parseInt(process.env.WS_PORT ?? '3001')
const MAX_LEN = parseInt(process.env.MAX_MESSAGE_LENGTH ?? '300')

// ── DB ──────────────────────────────────────────────────────────────────────
initDB()

// ── WebSocket ────────────────────────────────────────────────────────────────
const wss = new WebSocketServer({ port: WS_PORT })

function broadcast(event) {
  const data = JSON.stringify(event)
  for (const client of wss.clients) {
    if (client.readyState === 1) client.send(data)
  }
}

wss.on('connection', (ws) => {
  ws.on('message', (raw) => {
    try {
      const event = JSON.parse(raw.toString())
      if (event.type === 'audio:ended' && event.id) {
        queue.audioEnded(event.id)
      }
    } catch { /* ignorar mensajes malformados */ }
  })
})

queue.init(broadcast)

// ── Express ──────────────────────────────────────────────────────────────────
const app = express()
app.use(express.json())

// Validación de mensaje entrante
function validateMessage(body) {
  if (!body.text || typeof body.text !== 'string') return 'text es requerido'
  if (body.text.trim().length === 0)               return 'text no puede estar vacío'
  if (body.text.length > MAX_LEN)                  return `text excede ${MAX_LEN} caracteres`
  if (!['manual','webhook'].includes(body.source)) return 'source debe ser manual o webhook'
  return null
}

app.post('/api/message', (req, res) => {
  const error = validateMessage(req.body)
  if (error) return res.status(400).json({ error })

  const msg = {
    id:         crypto.randomUUID(),
    source:     req.body.source,
    donor_name: req.body.donor_name ?? null,
    amount:     req.body.amount     ?? null,
    text:       req.body.text.trim(),
    status:     'PENDING',
    retries:    0,
    audio_path: null,
    created_at: Date.now(),
    updated_at: Date.now(),
    error_msg:  null
  }

  insertMessage(msg)
  queue.add(msg)
  res.status(201).json({ id: msg.id })
})

app.post('/api/control/:action', (req, res) => {
  const valid = ['pause','resume','stop','skip']
  if (!valid.includes(req.params.action)) {
    return res.status(400).json({ error: 'invalid action' })
  }
  queue.control(req.params.action)
  res.json({ ok: true })
})

app.get('/api/history', (_req, res) => {
  res.json(getHistory(50))
})

app.get('/audio/:id', (req, res) => {
  const filePath = resolve(`./audio_cache/${req.params.id}.mp3`)
  if (!existsSync(filePath)) return res.status(404).json({ error: 'not found' })
  res.sendFile(filePath)
})

app.get('/overlay', (_req, res) => {
  res.sendFile(resolve('./public/overlay.html'))
})

app.get('/panel', (_req, res) => {
  res.sendFile(resolve('./public/panel.html'))
})

app.listen(PORT, () => {
  console.log(`HTTP  → http://localhost:${PORT}`)
  console.log(`WS    → ws://localhost:${WS_PORT}`)
  console.log(`Panel → http://localhost:${PORT}/panel`)
  console.log(`OBS   → http://localhost:${PORT}/overlay`)
})
```

Y en `package.json` agregar `"type": "module"` para ESM.

### Checks fase 5
```bash
# Terminal 1
node server.js &
sleep 2

# Verificar HTTP
curl -s -X POST http://localhost:3000/api/message \
  -H "Content-Type: application/json" \
  -d '{"text":"Prueba del agente","source":"manual"}' \
  | grep -q '"id"' && echo "POST /api/message OK"

curl -s http://localhost:3000/api/history \
  | grep -q '"text"' && echo "GET /api/history OK"

curl -s -X POST http://localhost:3000/api/control/pause \
  | grep -q '"ok"' && echo "POST /api/control OK"

curl -s -o /dev/null -w "%{http_code}" \
  http://localhost:3000/audio/no-existe | grep -q "404" && echo "GET /audio 404 OK"

kill %1
```
- [ ] Los 4 checks imprimen "OK"
- [ ] No hay stack traces en la salida del servidor

---

## Fase 6 — Interfaces web (`overlay.html` y `panel.html`)

### `public/overlay.html`

Requisitos de implementación estrictos:
- Fondo transparente (`background: transparent`)
- Texto posicionado en la parte inferior de la viewport
- Animación de fade-in al aparecer (0.3s) y fade-out al desaparecer (0.3s)
- Un elemento `<audio id="player">` que carga y reproduce `audioUrl`
- WebSocket conecta a `ws://localhost:3001`
- Al recibir `message:start`: mostrar texto, cargar audio, reproducir
- Al recibir `message:done` o `queue:stopped`: ocultar texto, detener audio
- Al recibir `queue:paused`: `player.pause()`
- Al recibir `queue:resumed`: `player.play()`
- Cuando `player` emite evento `ended`: enviar `{ type: "audio:ended", id: currentId }` por WebSocket
- Si WebSocket se desconecta: reintentar cada 3 segundos con `setTimeout(() => location.reload(), 3000)`
- Todo en un único archivo HTML sin dependencias externas

### `public/panel.html`

Requisitos de implementación estrictos:
- Sección de ingreso manual: campo de texto + campo donor_name (opcional) + campo amount (opcional) + botón Enviar
- Botones de control: Pausar | Reanudar | Detener | Saltar actual
- Sección de historial: tabla con columnas id (primeros 8 chars), text (truncado a 40 chars), source, status, retries, created_at (formato HH:MM:SS)
- La tabla se actualiza en tiempo real vía polling a `GET /api/history` cada 2 segundos
- Estado de la cola visible: contador de mensajes pendientes (desde evento `queue:updated`)
- Colores por estado:
  - `DONE` → verde
  - `FAILED` → rojo
  - `PLAYING` → amarillo
  - `PAUSED` → naranja
  - `QUEUED` / `SYNTHESIZING` → gris azulado
  - `SKIPPED` → gris
- Todo en un único archivo HTML sin dependencias externas
- No usar `<form>` tags. Usar botones con `onclick` o `addEventListener('click', ...)`

### Checks fase 6
- [ ] `public/overlay.html` existe y no tiene tags `<form>`
- [ ] `public/panel.html` existe y no tiene tags `<form>`
- [ ] Ambos archivos abren sin error de consola JS al cargar en browser con el servidor corriendo
- [ ] Al enviar un mensaje desde el panel, aparece en la tabla de historial en ≤ 3 segundos

---

## Fase 7 — Smoke test (`test/smoke.js`)

El agente implementa este archivo exactamente. Se ejecuta con `node test/smoke.js` con el servidor corriendo:

```js
// test/smoke.js
// Smoke test: envía un mensaje manual y verifica que llegue a estado DONE o FAILED

const BASE = 'http://localhost:3000'

async function run() {
  console.log('=== Smoke Test ===')

  // 1. Enviar mensaje
  const res = await fetch(`${BASE}/api/message`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: 'Test de smoke', source: 'manual' })
  })
  const { id } = await res.json()
  console.assert(typeof id === 'string', 'id debe ser string')
  console.log(`[1] Mensaje enviado: ${id}`)

  // 2. Esperar hasta 15s a que el estado sea DONE o FAILED
  let finalStatus = null
  for (let i = 0; i < 30; i++) {
    await sleep(500)
    const history = await fetch(`${BASE}/api/history`).then(r => r.json())
    const msg = history.find(m => m.id === id)
    if (msg && ['DONE','FAILED'].includes(msg.status)) {
      finalStatus = msg.status
      break
    }
  }

  console.assert(finalStatus !== null, 'El mensaje no llegó a estado final en 15s')
  console.log(`[2] Estado final: ${finalStatus}`)

  // 3. Control: pause debe responder ok
  const ctrl = await fetch(`${BASE}/api/control/pause`, { method: 'POST' })
  const { ok } = await ctrl.json()
  console.assert(ok === true, 'control/pause debe responder {ok: true}')
  console.log('[3] Control pause: OK')

  // 4. Resume
  const ctrl2 = await fetch(`${BASE}/api/control/resume`, { method: 'POST' })
  const { ok: ok2 } = await ctrl2.json()
  console.assert(ok2 === true, 'control/resume debe responder {ok: true}')
  console.log('[4] Control resume: OK')

  // 5. Acción inválida debe devolver 400
  const bad = await fetch(`${BASE}/api/control/explode`, { method: 'POST' })
  console.assert(bad.status === 400, 'acción inválida debe devolver 400')
  console.log('[5] Control inválido: 400 OK')

  console.log('=== Smoke Test PASSED ===')
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

run().catch(e => { console.error('SMOKE TEST FAILED:', e); process.exit(1) })
```

### Checks finales del proyecto
```bash
node server.js &
sleep 2
node test/smoke.js
kill %1
```
- [ ] Imprime `=== Smoke Test PASSED ===`
- [ ] Exit code 0

---

## Criterios de aceptación globales

El proyecto se considera completo cuando:

1. `npm start` inicia el servidor sin error
2. `npm test` (con servidor corriendo) imprime `PASSED` y termina con exit code 0
3. `http://localhost:3000/overlay` carga sin errores de consola JS
4. `http://localhost:3000/panel` carga sin errores de consola JS
5. Un mensaje enviado desde el panel aparece sintetizado y reproducible en el overlay
6. Los controles pause/resume/stop funcionan desde el panel
7. El historial muestra el mensaje con estado `DONE` tras la reproducción

---

## Integración OBS (instrucción para el humano, no para el agente)

1. Abrir OBS → Fuentes → `+` → **Browser**
2. URL: `http://localhost:3000/overlay`
3. Ancho: `1920` | Alto: `150`
4. ✅ Shutdown source when not visible
5. ✅ Refresh browser when scene becomes active
6. El servidor debe estar corriendo antes de iniciar OBS

---

## Lo que el agente NO debe hacer

- No agregar autenticación, JWT, sessions ni CORS headers
- No agregar logging a archivos (solo console.log)
- No agregar tests más allá de `test/smoke.js`
- No crear un Dockerfile
- No agregar `nodemon` ni hot-reload
- No dividir `server.js` en múltiples archivos de rutas
- No agregar TypeScript ni transpilación
- No agregar linters ni formatters
- No crear documentación adicional
