# Guía de Migración a Supabase

Este documento describe cómo migrar el sistema TTS actual de SQLite local a Supabase.

## Arquitectura Actual vs. Nueva

**Actual:** 
- SQLite local (better-sqlite3)
- Archivos de audio en sistema de archivos local (`./audio_cache/`)
- Servidor Express/Node.js que maneja todo

**Con Supabase:**
- Base de datos PostgreSQL en Supabase
- Archivos de audio en Supabase Storage
- Servidor Express/Node.js (opcional, puede quedar como middleware)
- Los clientes se conectan directamente a Supabase (para algunas operaciones) o vía el servidor

## Pasos de Migración

### 1. Crear Proyecto en Supabase
1. Ve a [supabase.com](https://supabase.com) y crea un nuevo proyecto
2. Anota tu URL de proyecto y clave anon/public
3. En tu `.env`, agrega:
   ```
   SUPABASE_URL=tu_url_de_proyecto
   SUPABASE_ANON_KEY=tu_anon_key
   SUPABASE_SERVICE_ROLE_KEY=tu_service_role_key (para operaciones privilegiadas)
   ```

### 2. Esquema de Base deDatos
Ejecuta este SQL en el editor SQL de Supabase:

```sql
-- Tabla de mensajes
CREATE TABLE messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source TEXT NOT NULL CHECK(source IN ('manual','webhook')),
    donor_name TEXT,
    amount DECIMAL(10,2),
    text TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'PENDING'
        CHECK(status IN ('PENDING','QUEUED','SYNTHESIZING','READY','PLAYING','PAUSED','DONE','FAILED','SKIPPED')),
    retries INTEGER NOT NULL DEFAULT 0,
    audio_path TEXT, -- Ruta en Supabase Storage
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    error_msg TEXT
);

CREATE INDEX idx_messages_status ON messages(status);
CREATE INDEX idx_messages_created ON messages(created_at DESC);

-- Tabla de deduplicación de webhooks
CREATE TABLE webhook_dedupe (
    provider TEXT NOT NULL,
    dedupe_key TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT 'webhook',
    provider_event_id TEXT,
    provider_delivery_id TEXT,
    payload_json JSONB,
    status TEXT NOT NULL DEFAULT 'CLAIMED'
        CHECK(status IN ('CLAIMED','PROCESSED','FAILED')),
    message_id UUID REFERENCES messages(id),
    error_msg TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    PRIMARY KEY (provider, dedupe_key)
);

CREATE INDEX idx_webhook_dedupe_status ON webhook_dedupe(status);
CREATE INDEX idx_webhook_dedupe_created ON webhook_dedupe(created_at DESC);

-- Tabla de configuración (settings)
CREATE TABLE settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insertar configuración por defecto
INSERT INTO settings (key, value) VALUES
('audioProfilePreference', 'auto'),
('messageFilterEnabled', 'false'),
('messageFilterBlacklist', '[]'),
('ttsVoice', 'es-AR-TomasNeural'),
('ttsPreset', 'neutral'),
('kickBotConfig', '{"enabled":false,"channel":"","prefix":"!","allowTtsFromChat":false,"allowCommandsFromMods":true,"allowCommandsFromVip":false,"viewerCommands":["help","status","tts"],"moderatorCommands":["help","status","tts","skip","replay","voice","preset","cancel","delete","restore"],"streamerCommands":["help","status","tts","skip","replay","voice","preset","cancel","delete","restore"]}')
ON CONFLICT (key) DO NOTHING;
```

### 3. Configurar Supabase Storage para Audio
1. En el dashboard de Supabase, ve a Storage
2. Crea un bucket llamado `tts-audio` (tipo público)
3. Configura las políticas:
   - Permitir `INSERT` y `SELECT` a todos (para que los clientes puedan descargar el audio)
   - O hacer que el servidor suba y genere URLs firmadas temporales

### 4. Actualizar Variables de Entorno
Agrega a tu `.env`:
```
SUPABASE_URL=https://tu-proyecto.supabase.co
SUPABASE_ANON_KEY=tu_anon_key_aqui
SUPABASE_SERVICE_ROLE_KEY=tu_service_role_key_aqui
AUDIO_CACHE_DIR=./audio_cache (opcional, para fallback)
```

### 5. Crear Nuevo Módulo de Acceso a Datos
Crea un nuevo archivo `supabase-db.js` que reemplace las funciones de `db.js`:

```javascript
// supabase-db.js
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.SUPABASE_URL
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

// Cliente para operaciones públicas (usado por el servidor)
export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Cliente para operaciones privilegiadas (usado por el servidor)
export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey)

// Luego reimplementar todas las funciones de db.js usando Supabase
// Por ejemplo:
export async function insertMessage(msg) {
  const { data, error } = await supabase
    .from('messages')
    .insert({
      id: msg.id,
      source: msg.source,
      donor_name: msg.donor_name,
      amount: msg.amount,
      text: msg.text,
      status: msg.status || 'PENDING',
      retries: msg.retries || 0,
      created_at: new Date(msg.created_at || Date.now()),
      updated_at: new Date()
    })
  
  if (error) throw error
  return data[0]
}

// ... y así sucesivamente para todas las funciones
```

### 6. Actualizar el Servidor para Usar Supabase
En `server.js`, reemplaza:
```javascript
import { initDB, insertMessage, /* ... */ } from './db.js'
```
por:
```javascript
import { supabase as db } from './supabase-db.js'
// O crear un adaptador que mantenga la misma interfaz
```

### 7. Manejar Archivos de Audio
Opción A: Mantener audio local + Supabase para DB
- El servidor sigue generando audio localmente
- Solo la base de datos se mueve a Supabase
- Más simple de implementar

Opción B: Audio en Supabase Storage
- El servidor sube los archivos MP3 a Supabase Storage
- Guarda la ruta/storage path en la base de datos
- Sirve audio mediante URLs de Supabase (públicas o firmadas)
- Requiere cambiar cómo se sirve el audio en `/audio/:id`

### 8. Actualizar WebSocket y API
Los endpoints HTTP (`/api/message`, `/api/queue`, etc.) pueden permanecer igual si:
- Mantienes el servidor Express como capa intermedia
- El servidor habla con Supabase en lugar de SQLite
- Los clientes siguen conectándose a tu servidor (no directamente a Supabase)

O alternativa: Clientes se conectan directamente a Supabase
- Para operaciones de solo lectura (historial, estado de cola)
- Usando Realtime de Supabase para actualizaciones en tiempo real
- Pero esto requiere rehacer más del frontend

### 9. Consideraciones de TTS
El proceso de TTS (tts.js) sigue ejecutándose localmente en el servidor
- Necesitas mantener el servidor donde corre Node.js para tener acceso a edge-tts
- O migrar TTS a una función edge/función de Supabase (más complejo)

### 10. Migración de Datos Existentes
1. Exporta tu SQLite actual a JSON/CSV
2. Importa a Supabase usando:
   - El editor SQL de Supabase
   - Herramientas de migración como `pgloader`
   - Scripts personalizados

## Beneficios de la Migración
1. **Escalabilidad**: Supabase maneja el escalado automáticamente
2. **Disponibilidad**: Base de datos siempre disponible, no depende de tu máquina local
3. **Respaldos automáticos**: Supabase hace backups regulares
4. **Realtime**: Posibilidad de usar Supabase Realtime para actualizaciones instantáneas
5. **Storage**: Archivos de audio accesibles desde cualquier lugar con CDN

## Desafíos a Considerar
1. **Latencia**: Las llamadas a Supabase añaden latencia de red vs. SQLite local
2. **Costos**: Supabase tiene costos basado en uso (aunque el plan gratuito es generoso)
3. **Dependencia externa**: Ahora dependes del servicio de Supabase
4. **Complejidad**: Necesitas manejar conexiones, pooling, manejo de errores de red

## Recomendación de Implementación por Fases

**Fase 1: Solo Base de Datos**
- Migrar solo `db.js` a Supabase
- Mantener audio local y servidor Express igual
- Probar exhaustivamente

**Fase 2: Audio en Storage (Opcional)**
- Mover la generación y almacenamiento de audio a Supabase Storage
- Actualizar cómo se sirven los archivos de audio

**Fase 3: Cliente Directo a Supabase (Opcional)**
- Permitir que el panel/overlay se conecten directamente a Supabase para lecturas
- Mantener comandos (envío de mensajes, control) vía tu servidor para seguridad

## Recursos
- Documentación de Supabase JS: https://supabase.com/docs/reference/javascript/init
- Guía de almacenamiento: https://supabase.com/docs/guides/storage
- Realtime: https://supabase.com/docs/realtime