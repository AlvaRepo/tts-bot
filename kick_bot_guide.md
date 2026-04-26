# Kick Chat Bot — Guía para el Agente

## Contexto

Este documento explica cómo construir un bot que **lee y escribe mensajes** en el chat de Kick.com usando la API oficial.

- **Leer mensajes**: WebSocket de Pusher (no requiere auth)
- **Escribir mensajes**: REST API oficial (`api.kick.com`) con OAuth 2.1 + PKCE
- **El problema típico de auth**: PKCE requiere un `code_verifier` y un `code_challenge`. Si no se generan bien, el token exchange falla con 400/401.

---

## Paso 1 — Registrar la App en Kick

1. Ir a: `https://kick.com/settings/developer`
2. Crear una nueva aplicación
3. Guardar:
   - `client_id`
   - `client_secret`
4. Configurar el **Redirect URI** como: `http://localhost:3000/callback`
   - Para desarrollo local, Kick acepta `localhost`

---

## Paso 2 — Entender el flujo OAuth 2.1 con PKCE

```
Usuario → App genera code_verifier + code_challenge
       → Redirige a id.kick.com/oauth/authorize con code_challenge
       → Usuario aprueba en Kick
       → Kick redirige a /callback con ?code=XXXX
       → App hace POST a id.kick.com/oauth/token con code + code_verifier
       → Kick devuelve access_token + refresh_token
```

**CRÍTICO**: El `code_verifier` debe guardarse entre el redirect y el callback. Si se pierde, el exchange falla.

### Endpoints OAuth

| Paso | Método | URL |
|------|--------|-----|
| Autorizar | GET | `https://id.kick.com/oauth/authorize` |
| Token | POST | `https://id.kick.com/oauth/token` |
| Refresh | POST | `https://id.kick.com/oauth/token` |

### Scopes necesarios

```
user:read        → info del usuario autenticado
channel:read     → leer datos del canal
chat:write       → enviar mensajes al chat
events:subscribe → webhooks (opcional para leer eventos)
```

---

## Paso 3 — Generar PKCE correctamente

```javascript
// Generar code_verifier (43-128 chars, URL-safe)
function generateCodeVerifier() {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return btoa(String.fromCharCode(...array))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

// Generar code_challenge (SHA-256 del verifier, base64url)
async function generateCodeChallenge(verifier) {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}
```

---

## Paso 4 — URL de autorización

```javascript
const CLIENT_ID = 'TU_CLIENT_ID';
const REDIRECT_URI = 'http://localhost:3000/callback';
const SCOPES = 'user:read channel:read chat:write';

const codeVerifier = generateCodeVerifier();
const codeChallenge = await generateCodeChallenge(codeVerifier);
const state = crypto.randomUUID();

// Guardar en sessionStorage o variable para el callback
sessionStorage.setItem('code_verifier', codeVerifier);
sessionStorage.setItem('oauth_state', state);

const authURL = new URL('https://id.kick.com/oauth/authorize');
authURL.searchParams.set('response_type', 'code');
authURL.searchParams.set('client_id', CLIENT_ID);
authURL.searchParams.set('redirect_uri', REDIRECT_URI);
authURL.searchParams.set('scope', SCOPES);
authURL.searchParams.set('code_challenge', codeChallenge);
authURL.searchParams.set('code_challenge_method', 'S256');
authURL.searchParams.set('state', state);

window.location.href = authURL.toString();
```

---

## Paso 5 — Callback: intercambiar el code por tokens

Kick redirige a `/callback?code=XXXX&state=YYYY`

```javascript
const params = new URLSearchParams(window.location.search);
const code = params.get('code');
const returnedState = params.get('state');

// Validar state (prevenir CSRF)
if (returnedState !== sessionStorage.getItem('oauth_state')) {
  throw new Error('State mismatch — posible ataque CSRF');
}

const codeVerifier = sessionStorage.getItem('code_verifier');

const response = await fetch('https://id.kick.com/oauth/token', {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET, // solo en server-side
    redirect_uri: REDIRECT_URI,
    code_verifier: codeVerifier,
    code: code,
  }),
});

const tokens = await response.json();
// tokens.access_token
// tokens.refresh_token
// tokens.expires_in
```

---

## Paso 6 — Leer mensajes del chat (WebSocket Pusher)

**No requiere autenticación.** Kick usa Pusher internamente.

Necesitás el `chatroom_id` del canal. Se obtiene así:

```
GET https://api.kick.com/public/v1/channels?broadcaster_user_login=NOMBRE_CANAL
```

```javascript
// Obtener chatroom_id
const res = await fetch(
  'https://api.kick.com/public/v1/channels?broadcaster_user_login=nombre_canal',
  { headers: { Authorization: `Bearer ${accessToken}` } }
);
const data = await res.json();
const chatroomId = data.data[0].chatroom.id;

// Conectar al chat via WebSocket de Pusher
const socket = new WebSocket(
  `wss://ws-us2.pusher.com/app/32cbd69e4b950bf97679?protocol=7&client=js&version=7.6.0&flash=false`
);

socket.onopen = () => {
  // Suscribirse al chatroom
  socket.send(JSON.stringify({
    event: 'pusher:subscribe',
    data: { auth: '', channel: `chatrooms.${chatroomId}.v2` }
  }));
};

socket.onmessage = (event) => {
  const msg = JSON.parse(event.data);
  if (msg.event === 'App\\Events\\ChatMessageEvent') {
    const data = JSON.parse(msg.data);
    console.log(`${data.sender.username}: ${data.content}`);
  }
};
```

---

## Paso 7 — Enviar mensajes al chat

Requiere `access_token` con scope `chat:write` y el `broadcaster_user_id`.

```javascript
const sendMessage = async (accessToken, broadcasterUserId, content) => {
  const res = await fetch('https://api.kick.com/public/v1/chat', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      type: 'bot',               // "bot" o "user"
      content: content,          // max 500 chars
      broadcaster_user_id: broadcasterUserId,
    }),
  });
  return res.json();
};
```

---

## Paso 8 — Refresh del token

El `access_token` expira. Usar el `refresh_token` para renovar:

```javascript
const refreshTokens = async (refreshToken) => {
  const res = await fetch('https://id.kick.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      refresh_token: refreshToken,
    }),
  });
  return res.json(); // nuevo access_token + refresh_token
};
```

---

## Errores comunes en auth

| Error | Causa | Fix |
|-------|-------|-----|
| `invalid_grant` | `code_verifier` perdido o incorrecto | Guardarlo en `sessionStorage` antes del redirect |
| `invalid_client` | `client_secret` mal en el body | Verificar que esté en el POST body como form-encoded |
| `redirect_uri_mismatch` | URI no coincide exactamente | Debe ser igual al registrado, incluyendo el trailing slash |
| `invalid_request` | Falta `code_challenge_method` | Siempre incluir `code_challenge_method=S256` |
| 401 al enviar | Scope `chat:write` no incluido | Re-autenticar con el scope correcto |

---

## HTML — Demo funcional (archivo listo para usar)

El siguiente HTML implementa todo el flujo completo en un solo archivo.  
Reemplazar `YOUR_CLIENT_ID` y `YOUR_CLIENT_SECRET` antes de usar.

> **Nota**: `client_secret` en frontend es solo para pruebas locales. En producción, el exchange de token debe hacerse en un servidor.

```html
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Kick Chat Bot</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: monospace; background: #0f0f0f; color: #e0e0e0; padding: 20px; }
    h1 { color: #53fc18; margin-bottom: 20px; }
    .section { background: #1a1a1a; border: 1px solid #333; border-radius: 8px; padding: 16px; margin-bottom: 16px; }
    .section h2 { color: #53fc18; font-size: 14px; margin-bottom: 12px; text-transform: uppercase; letter-spacing: 1px; }
    input, textarea { width: 100%; background: #0f0f0f; border: 1px solid #444; border-radius: 4px; padding: 8px; color: #e0e0e0; font-family: monospace; font-size: 13px; margin-bottom: 8px; }
    button { background: #53fc18; color: #000; border: none; border-radius: 4px; padding: 8px 16px; font-weight: bold; cursor: pointer; font-family: monospace; }
    button:disabled { background: #333; color: #666; cursor: not-allowed; }
    button:hover:not(:disabled) { background: #3fd410; }
    #chat-log { height: 300px; overflow-y: auto; background: #0a0a0a; border: 1px solid #333; border-radius: 4px; padding: 10px; font-size: 12px; }
    .msg { margin-bottom: 4px; }
    .msg .user { color: #53fc18; }
    .msg .content { color: #ccc; }
    .status { font-size: 12px; color: #888; margin-top: 8px; }
    .status.ok { color: #53fc18; }
    .status.error { color: #ff4444; }
    .row { display: flex; gap: 8px; }
    .row input { flex: 1; margin-bottom: 0; }
  </style>
</head>
<body>

<h1>⚡ Kick Chat Bot</h1>

<!-- CONFIG -->
<div class="section">
  <h2>1. Configuración</h2>
  <input type="text" id="client_id" placeholder="Client ID (de kick.com/settings/developer)" />
  <input type="password" id="client_secret" placeholder="Client Secret" />
  <input type="text" id="channel_name" placeholder="Nombre del canal (ej: xqc)" />
  <button onclick="startAuth()">Autenticar con Kick</button>
  <div id="auth-status" class="status"></div>
</div>

<!-- TOKEN INFO -->
<div class="section" id="token-section" style="display:none">
  <h2>2. Estado del Token</h2>
  <div id="token-status" class="status ok">✅ Autenticado</div>
  <div id="user-info" class="status"></div>
  <button onclick="connectChat()">Conectar al Chat</button>
</div>

<!-- CHAT READ -->
<div class="section" id="chat-section" style="display:none">
  <h2>3. Chat en vivo</h2>
  <div id="chat-log"></div>
  <div id="ws-status" class="status"></div>
</div>

<!-- SEND MESSAGE -->
<div class="section" id="send-section" style="display:none">
  <h2>4. Enviar Mensaje</h2>
  <div class="row">
    <input type="text" id="msg-input" placeholder="Mensaje (max 500 chars)" />
    <button onclick="sendMessage()">Enviar</button>
  </div>
  <div id="send-status" class="status"></div>
</div>

<script>
  const REDIRECT_URI = window.location.origin + window.location.pathname;
  let accessToken = null;
  let refreshToken = null;
  let broadcasterUserId = null;
  let ws = null;

  // ─── PKCE helpers ─────────────────────────────────────────────
  function generateCodeVerifier() {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    return btoa(String.fromCharCode(...array))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  }

  async function generateCodeChallenge(verifier) {
    const data = new TextEncoder().encode(verifier);
    const digest = await crypto.subtle.digest('SHA-256', data);
    return btoa(String.fromCharCode(...new Uint8Array(digest)))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  }

  // ─── STEP 1: Iniciar auth ──────────────────────────────────────
  async function startAuth() {
    const clientId = document.getElementById('client_id').value.trim();
    if (!clientId) return setStatus('auth-status', '❌ Falta el Client ID', 'error');

    const verifier = generateCodeVerifier();
    const challenge = await generateCodeChallenge(verifier);
    const state = crypto.randomUUID();

    sessionStorage.setItem('kick_code_verifier', verifier);
    sessionStorage.setItem('kick_state', state);
    sessionStorage.setItem('kick_client_id', clientId);
    sessionStorage.setItem('kick_client_secret', document.getElementById('client_secret').value.trim());
    sessionStorage.setItem('kick_channel', document.getElementById('channel_name').value.trim());

    const url = new URL('https://id.kick.com/oauth/authorize');
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('client_id', clientId);
    url.searchParams.set('redirect_uri', REDIRECT_URI);
    url.searchParams.set('scope', 'user:read channel:read chat:write');
    url.searchParams.set('code_challenge', challenge);
    url.searchParams.set('code_challenge_method', 'S256');
    url.searchParams.set('state', state);

    window.location.href = url.toString();
  }

  // ─── STEP 2: Callback — intercambiar code por tokens ──────────
  async function handleCallback() {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const returnedState = params.get('state');
    const error = params.get('error');

    if (error) return setStatus('auth-status', `❌ Error de Kick: ${error}`, 'error');
    if (!code) return;

    const savedState = sessionStorage.getItem('kick_state');
    if (returnedState !== savedState) return setStatus('auth-status', '❌ State mismatch — CSRF detectado', 'error');

    const clientId = sessionStorage.getItem('kick_client_id');
    const clientSecret = sessionStorage.getItem('kick_client_secret');
    const codeVerifier = sessionStorage.getItem('kick_code_verifier');

    setStatus('auth-status', '⏳ Intercambiando código...', '');

    try {
      const res = await fetch('https://id.kick.com/oauth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: REDIRECT_URI,
          code_verifier: codeVerifier,
          code: code,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error_description || data.error || JSON.stringify(data));

      accessToken = data.access_token;
      refreshToken = data.refresh_token;

      // Limpiar URL
      window.history.replaceState({}, '', window.location.pathname);

      // Restaurar campos
      document.getElementById('client_id').value = clientId;
      document.getElementById('client_secret').value = clientSecret;
      document.getElementById('channel_name').value = sessionStorage.getItem('kick_channel') || '';

      await fetchUserInfo();
      document.getElementById('token-section').style.display = 'block';
      setStatus('auth-status', '✅ Token obtenido', 'ok');
    } catch (e) {
      setStatus('auth-status', `❌ ${e.message}`, 'error');
    }
  }

  // ─── Obtener info del usuario autenticado ─────────────────────
  async function fetchUserInfo() {
    const res = await fetch('https://api.kick.com/public/v1/users', {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    const data = await res.json();
    if (data.data && data.data[0]) {
      const u = data.data[0];
      document.getElementById('user-info').textContent = `Logueado como: ${u.username} (id: ${u.id})`;
    }
  }

  // ─── STEP 3: Conectar WebSocket Pusher ────────────────────────
  async function connectChat() {
    const channelName = document.getElementById('channel_name').value.trim();
    if (!channelName) return setStatus('ws-status', '❌ Falta el nombre del canal', 'error');

    setStatus('ws-status', '⏳ Obteniendo chatroom ID...', '');

    try {
      // Obtener broadcaster_user_id y chatroom_id
      const res = await fetch(
        `https://api.kick.com/public/v1/channels?broadcaster_user_login=${channelName}`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      const data = await res.json();
      if (!data.data || !data.data[0]) throw new Error('Canal no encontrado');

      const channel = data.data[0];
      broadcasterUserId = channel.broadcaster_user_id;
      const chatroomId = channel.chatroom.id;

      setStatus('ws-status', `⏳ Conectando al chatroom ${chatroomId}...`, '');

      // Conectar Pusher
      ws = new WebSocket(
        'wss://ws-us2.pusher.com/app/32cbd69e4b950bf97679?protocol=7&client=js&version=7.6.0&flash=false'
      );

      ws.onopen = () => {
        ws.send(JSON.stringify({
          event: 'pusher:subscribe',
          data: { auth: '', channel: `chatrooms.${chatroomId}.v2` }
        }));
        setStatus('ws-status', `✅ Conectado al chat de ${channelName}`, 'ok');
        document.getElementById('chat-section').style.display = 'block';
        document.getElementById('send-section').style.display = 'block';
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.event === 'App\\Events\\ChatMessageEvent') {
            const d = JSON.parse(msg.data);
            appendMessage(d.sender.username, d.content);
          }
        } catch {}
      };

      ws.onclose = () => setStatus('ws-status', '🔌 Desconectado', 'error');
      ws.onerror = () => setStatus('ws-status', '❌ Error en WebSocket', 'error');

    } catch (e) {
      setStatus('ws-status', `❌ ${e.message}`, 'error');
    }
  }

  // ─── STEP 4: Enviar mensaje ────────────────────────────────────
  async function sendMessage() {
    const content = document.getElementById('msg-input').value.trim();
    if (!content || !accessToken || !broadcasterUserId) return;

    try {
      const res = await fetch('https://api.kick.com/public/v1/chat', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type: 'bot',
          content,
          broadcaster_user_id: broadcasterUserId,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message || JSON.stringify(data));

      document.getElementById('msg-input').value = '';
      setStatus('send-status', '✅ Mensaje enviado', 'ok');
    } catch (e) {
      setStatus('send-status', `❌ ${e.message}`, 'error');
    }
  }

  // ─── Helpers UI ───────────────────────────────────────────────
  function appendMessage(user, content) {
    const log = document.getElementById('chat-log');
    const div = document.createElement('div');
    div.className = 'msg';
    div.innerHTML = `<span class="user">${escapeHtml(user)}</span>: <span class="content">${escapeHtml(content)}</span>`;
    log.appendChild(div);
    log.scrollTop = log.scrollHeight;
  }

  function setStatus(id, msg, type) {
    const el = document.getElementById(id);
    el.textContent = msg;
    el.className = `status ${type}`;
  }

  function escapeHtml(str) {
    return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  // ─── Init — detectar si estamos en el callback ─────────────────
  if (window.location.search.includes('code=')) {
    handleCallback();
  }

  // Enter para enviar
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && document.activeElement.id === 'msg-input') {
      sendMessage();
    }
  });
</script>
</body>
</html>
```

---

## Notas para el agente

- **El `client_secret` NO debe estar en frontend en producción.** El exchange de token va en un servidor Node/Python que lo tiene en variables de entorno.
- **El `code_verifier` se debe persistir** entre el redirect inicial y el callback. `sessionStorage` funciona para una tab. Si se abre en una nueva tab, se pierde.
- **El Pusher app key** (`32cbd69e4b950bf97679`) es el que usa Kick actualmente — puede cambiar, verificar en las DevTools de kick.com si deja de funcionar.
- **Para Twitch**: reemplazar `id.kick.com` por `id.twitch.tv`, el token URL por `https://id.twitch.tv/oauth2/token`, y el chat por IRC sobre WebSocket (`wss://irc-ws.chat.twitch.tv`).
- **Para Discord**: Discord usa OAuth2 estándar (sin PKCE requerido para bots), y los bots leen chat via Gateway WebSocket (`wss://gateway.discord.gg`).
