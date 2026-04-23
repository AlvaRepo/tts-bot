# 🚀 Pasos Finales para Entregar el Servicio a tu Cliente

## ✅ Lo que ya está hecho:
1. ✅ Cliente de Supabase instalado (`@supabase/supabase-js`)
2. ✅ Módulo `supabase-db.js` creado (reemplaza `db.js`)
3. ✅ `server.js` actualizado para usar Supabase
4. ✅ Esquema SQL listo (`supabase-schema.sql`)
5. ✅ Script de verificación creado (`check-supabase.js`)
6. ✅ Variables de entorno documentadas (`.env.example`)

## 📋 Lo que debes hacer AHORA:

### Paso 1: Crear Proyecto en Supabase
1. Ve a https://supabase.com y crea una cuenta (si no tienes)
2. Crea un **Nuevo Proyecto**
3. Anota los datos (los necesitarás para el Paso 2):
   - **Project URL**: `https://xxxxx.supabase.co`
   - **anon/public key**: En "Project Settings" > "API" > "Project API keys"
   - **service_role key**: En la misma sección (⚠️ Manten esto secreto)

### Paso 2: Ejecutar el Esquema SQL
1. En tu proyecto de Supabase, ve a **SQL Editor** (en el menú izquierda)
2. Crea una **New Query**
3. Copia y pega todo el contenido de `supabase-schema.sql`
4. Haz clic en **Run** (▶️)
5. Deberías ver: `✅ Esquema de Supabase creado exitosamente!`

### Paso 3: Configurar Storage para Audio (Opcional por ahora)
**Opción A: Mantener audio local (MÁS SIMPLE - Recomendado para empezar)**
- Tu servidor sigue guardando audio en `./audio_cache/`
- Supabase solo maneja la base de datos
- No necesitas configurar Storage aún

**Opción B: Mover audio a Supabase Storage (Más avanzado)**
1. Ve a **Storage** en el dashboard de Supabase
2. Crea un bucket llamado `tts-audio`
3. Configúralo como **Public** (para que los clientes puedan acceder)
4. Actualiza el código en `tts.js` para subir a Supabase Storage

### Paso 4: Configurar tu archivo `.env`
Crea o edita tu archivo `.env` y agrega:

```env
# Tus claves de Supabase (obtenidas en Paso 1)
SUPABASE_URL=https://tu-proyecto.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# Mantén estas configuraciones locales
PORT=49152
WS_PORT=49153
TTS_VOICE=es-AR-TomasNeural
AUDIO_CACHE_DIR=./audio_cache
```

### Paso 5: Verificar Conexión
Ejecuta en tu terminal:
```bash
npm run check:supabase
```

**Resultado esperado:**
```
✅ Variables de entorno encontradas
✓ Conexión exitosa! Datos: [...]
✅ ¡Todo listo! Tu conexión a Supabase está funcionando correctamente.
```

### Paso 6: Probar el Servidor
```bash
npm start
```

Deberías ver:
```
HTTP  → http://localhost:49152
WS    → ws://localhost:49153
Panel → http://localhost:49152/panel
OBS   → http://localhost:49152/overlay
✅ Conectado a Supabase (modo initDB)
```

### Paso 7: Verificar que todo funciona
1. Abre `http://localhost:49152/panel` en tu navegador
2. Envía un mensaje de prueba
3. Verifica en Supabase (Table Editor > messages) que se haya guardado
4. Verifica en `http://localhost:49152/overlay` que el overlay funciona

## 📦 Entrega al Cliente

Una vez que verifiques que todo funciona localmente, para entregarle el servicio:

### Opción A: Servidor en tu máquina (Actual)
- El cliente accede vía: `http://tu-ip-publica:49152/panel` y `/overlay`
- Necesitas abrir puertos 49152 y 49153 en tu firewall
- Requieres que tu máquina esté siempre encendida

### Opción B: Migrar a un VPS/Cloud (Recomendado para producción)
1. **Contratar un VPS** (DigitalOcean, Linode, AWS Lightsail, etc.) - ~$5-10/mes
2. **Instalar Node.js** en el servidor
3. **Subir el código:**
   ```bash
   git clone tu-repo
   cd TTS_Free
   npm install
   ```
4. **Configurar `.env`** con las claves de Supabase
5. **Ejecutar con PM2** (para que siempre esté corriendo):
   ```bash
   npm install -g pm2
   pm2 start server.js --name tts-service
   pm2 startup
   pm2 save
   ```
6. **Entregar al cliente las URLs:**
   - Panel: `http://ip-del-servidor:49152/panel`
   - Overlay: `http://ip-del-servidor:49152/overlay`

### Opción C: Serverless/Edge Functions (Avanzado)
- Migrar a Supabase Edge Functions
- Todo en Supabase (DB + Storage + Functions)
- Requiere más trabajo de refactorización

## 🎯 Recomendación para entrega RÁPIDA:

**Para hoy (2-3 horas):**
1. Completa Pasos 1-6 (probar localmente con Supabase)
2. Usa **Opción A** temporalmente (tu máquina)
3. Entrega al cliente las URLs con tu IP pública

**Para mañana (producción real):**
1. Contrata un VPS barato ($5/mes)
2. Despliega con PM2
3. Apunta un dominio (opcional)
4. El cliente tiene un servicio 24/7 estable

## ⚠️ Notas Importantes:

1. **El servidor Node.js sigue necesitando ejecutarse** (para TTS con edge-tts)
2. **Supabase maneja la base de datos** (disponible 24/7)
3. **Mantén el audio local por ahora** (más simple)
4. **El cliente no necesita saber sobre Supabase** - solo accede a las URLs como antes

## 📞 Soporte

Si algo falla, ejecuta:
```bash
npm run check:supabase
```

Y comparte la salida para diagnóstico.

---
¡Con esto ya tienes un servicio TTS profesional con base de datos en la nube! 🎉
