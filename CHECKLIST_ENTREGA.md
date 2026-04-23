# ✅ Checklist: Entrega del Servicio TTS al Cliente

## Preparación (30-45 min)

- [ ] **Crear cuenta en Supabase** (5 min)
  - Ir a https://supabase.com
  - Crear nuevo proyecto
  - Anotar: URL, anon key, service_role key

- [ ] **Ejecutar esquema SQL** (5 min)
  - En Supabase: SQL Editor > New Query
  - Copiar contenido de `supabase-schema.sql`
  - Clic en "Run"
  - Verificar: "✅ Esquema de Supabase creado exitosamente!"

- [ ] **Configurar archivo `.env`** (5 min)
  ```env
  SUPABASE_URL=https://tu-proyecto.supabase.co
  SUPABASE_ANON_KEY=tu_anon_key
  SUPABASE_SERVICE_ROLE_KEY=tu_service_role_key
  PORT=49152
  WS_PORT=49153
  TTS_VOICE=es-AR-TomasNeural
  AUDIO_CACHE_DIR=./audio_cache
  ```

- [ ] **Verificar conexión** (2 min)
  ```bash
  npm run check:supabase
  ```
  ✅ Debe mostrar: "¡Todo listo! Tu conexión a Supabase está funcionando correctamente."

- [ ] **Migrar datos antiguos (opcional)** (5 min)
  ```bash
  npm run migrate:supabase
  ```
  ⚠️ Solo si tienes mensajes en SQLite que quieras conservar

- [ ] **Probar servidor local** (5 min)
  ```bash
  npm start
  ```
  ✅ Debe mostrar:
  ```
  HTTP  → http://localhost:49152
  WS    → ws://localhost:49153
  Panel → http://localhost:49152/panel
  OBS   → http://localhost:49152/overlay
  ✅ Conectado a Supabase (modo initDB)
  ```

- [ ] **Verificar panel y overlay** (5 min)
  - Abrir: http://localhost:49152/panel
  - Enviar mensaje de prueba
  - Verificar en Supabase > Table Editor > messages que se guardó
  - Abrir: http://localhost:49152/overlay (debe mostrar el mensaje)

## Entrega al Cliente

### Opción RÁPIDA: Tu máquina (HOY)
- [ ] **Obtener tu IP pública**
  ```bash
  curl ifconfig.me
  ```

- [ ] **Abrir puertos en firewall de Windows**
  - Puerto 49152 (HTTP)
  - Puerto 49153 (WebSocket)

- [ ] **Entregar URLs al cliente:**
  ```
  Panel de control: http://TU_IP_PUBLICA:49152/panel
  Overlay para OBS: http://TU_IP_PUBLICA:49152/overlay
  ```

- [ ] **Instrucciones para el cliente:**
  - El panel lo puede abrir en cualquier navegador
  - El overlay agregarlo en OBS como "Fuente de navegador"
  - URL del overlay: `http://TU_IP_PUBLICA:49152/overlay`

### Opción PROFESIONAL: VPS en la nube (MAÑANA)
- [ ] **Contratar VPS** (~$5/mes)
  - DigitalOcean, Linode, AWS Lightsail, etc.

- [ ] **Configurar servidor:**
  ```bash
  # En el VPS
  sudo apt update
  sudo apt install nodejs npm git
  git clone tu-repositorio
  cd TTS_Free
  npm install
  # Configurar .env con credenciales de Supabase
  npm install -g pm2
  pm2 start server.js --name tts
  pm2 startup
  pm2 save
  ```

- [ ] **Entregar URLs definitivas:**
  ```
  Panel: http://IP_DEL_VPS:49152/panel
  Overlay: http://IP_DEL_VPS:49152/overlay
  ```

## Verificación Post-Entrega

- [ ] **El cliente puede acceder al panel** ✅
- [ ] **El cliente puede enviar mensajes de prueba** ✅
- [ ] **El overlay funciona en OBS del cliente** ✅
- [ ] **Los mensajes se ven en Supabase (Table Editor)** ✅
- [ ] **El audio se reproduce correctamente** ✅

## Soporte (si algo falla)

- **Error de conexión:** `npm run check:supabase`
- **Error de esquema:** Revisar `supabase-schema.sql`
- **Error de puertos:** Verificar firewall
- **Error de Supabase:** Revisar `SUPABASE_MIGRATION_GUIDE.md`

## 📦 Lo que entregas al cliente:

1. ✅ **Panel web funcional** - Control total del TTS
2. ✅ **Overlay para OBS** - Se superpone al stream
3. ✅ **Base de datos en la nube** - Historial disponible 24/7
4. ✅ **API documentada** - Puede integrar con otros sistemas
5. ✅ **Webhooks configurados** - Para donaciones automáticas
6. ✅ **Bot de Kick integrado** - Comandos en chat

## 🎉 ¡Listo para entregar!

Con este checklist, en menos de una hora le estarás entregando al cliente un servicio TTS profesional, escalable y disponible las 24 horas.

---
**Nota:** Si tienes prisa, usa la "Opción RÁPIDA" y entrega HOY mismo. Luego migras a VPS cuando tengas tiempo.
