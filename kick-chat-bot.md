# Kick Chat Bot — Guía completa

> Basada en la [API pública oficial de Kick](https://docs.kick.com) (actualizada a 2025/2026).

---

## Qué necesitás

| Requisito | Detalle |
|-----------|---------|
| **Cuenta de Kick** | La cuenta que va a actuar como bot (recomendable crear una cuenta separada) |
| **App registrada** en [dev.kick.com](https://dev.kick.com) | Te da `client_id` y `client_secret` |
| **Redirect URI** | Una URL que controlás (puede ser `localhost` para desarrollo) |
| **Scope `chat:write`** | Obligatorio para mandar mensajes |
| **`broadcaster_user_id`** | El ID numérico del canal donde querés escribir |

---

## Flujo completo paso a paso

### 1. Registrar la app

1. Ir a **[dev.kick.com](https://dev.kick.com)** → *Create App*
2. Completar nombre, redirect URI y descripción
3. Kick te devuelve: `client_id` y `client_secret`

---

### 2. OAuth 2.1 — Obtener el Access Token

Kick usa **OAuth 2.1 con PKCE**. El flujo es:

```
User → tu app → Kick (autorización) → code → tu app → access_token + refresh_token
```

#### a) Generar PKCE

```python
import secrets, hashlib, base64

code_verifier = secrets.token_urlsafe(64)
digest = hashlib.sha256(code_verifier.encode()).digest()
code_challenge = base64.urlsafe_b64encode(digest).rstrip(b'=').decode()
```

#### b) Redirigir al usuario a Kick

```
GET https://id.kick.com/oauth/authorize
  ?client_id=TU_CLIENT_ID
  &redirect_uri=TU_REDIRECT_URI
  &response_type=code
  &scope=chat:write user:read
  &state=RANDOM_STATE
  &code_challenge=TU_CODE_CHALLENGE
  &code_challenge_method=S256
```

El usuario autoriza → Kick redirige a tu `redirect_uri?code=XXXX`.

#### c) Intercambiar el `code` por tokens

```http
POST https://id.kick.com/oauth/token
Content-Type: application/x-www-form-urlencoded

grant_type=authorization_code
&client_id=TU_CLIENT_ID
&client_secret=TU_CLIENT_SECRET
&code=XXXX
&redirect_uri=TU_REDIRECT_URI
&code_verifier=TU_CODE_VERIFIER
```

**Respuesta:**
```json
{
  "access_token": "eyJ...",
  "refresh_token": "def...",
  "token_type": "Bearer",
  "expires_in": 3600
}
```

#### d) Refresh del token (cuando expira)

```http
POST https://id.kick.com/oauth/token
Content-Type: application/x-www-form-urlencoded

grant_type=refresh_token
&client_id=TU_CLIENT_ID
&client_secret=TU_CLIENT_SECRET
&refresh_token=TU_REFRESH_TOKEN
```

> ⚠️ Los refresh tokens en Kick son **reusables/flexibles** (actualización del 25/11/2025). Guardá siempre el último refresh token recibido.

---

### 3. Mandar un mensaje al chat

```http
POST https://api.kick.com/public/v1/chat
Authorization: Bearer TU_ACCESS_TOKEN
Content-Type: application/json

{
  "broadcaster_user_id": 123456,
  "content": "¡Hola chat!",
  "type": "bot"
}
```

**Respuesta exitosa:**
```json
{
  "data": {
    "is_sent": true,
    "message_id": "828f83bb-e391-4c78-9e91-af35a172840e"
  },
  "message": "OK"
}
```

**Para responder a un mensaje específico** (soporte desde 08/04/2025):
```json
{
  "broadcaster_user_id": 123456,
  "content": "¡Gracias por el follow!",
  "type": "bot",
  "reply_to_message_id": "ID_DEL_MENSAJE_ORIGINAL"
}
```

#### `type` field
- `"user"` — el mensaje aparece como si fuera el usuario autenticado
- `"bot"` — aparece con badge de bot (recomendado)

---

### 4. Obtener el `broadcaster_user_id`

```http
GET https://api.kick.com/public/v1/channels?broadcaster_user_login=NOMBRE_DEL_CANAL
Authorization: Bearer TU_ACCESS_TOKEN
```

El campo `broadcaster_user_id` está en la respuesta.

---

### 5. Escuchar mensajes del chat (para responder)

Kick usa **WebSockets vía Pusher**. El canal a suscribirse es:

```
chatrooms.{chatroom_id}.v2
```

Con la librería `pusher-js` o cualquier cliente Pusher compatible:

```javascript
const Pusher = require('pusher-js');

const pusher = new Pusher('32cbd69e4b950bf97679', { cluster: 'us2' });
const channel = pusher.subscribe(`chatrooms.${chatroomId}.v2`);

channel.bind('App\\Events\\ChatMessageEvent', (data) => {
  console.log(`${data.sender.username}: ${data.content}`);
  // Acá podés trigger lógica del bot
});
```

> El `chatroom_id` lo obtenés del endpoint `GET /channels`.

---

## Scopes relevantes

| Scope | Para qué |
|-------|---------|
| `user:read` | Leer info del usuario autenticado |
| `channel:read` | Leer info del canal |
| `chat:write` | **Mandar mensajes al chat** ← obligatorio |
| `events:subscribe` | Suscribirse a webhooks/eventos |
| `channel:write` | Modificar configuración del canal |

---

## Automatización completa

Sí, se puede automatizar 100%. El flujo automatizado es:

```
┌─────────────┐     tokens guardados      ┌──────────────────┐
│  Bot arranca│ ─────────────────────────▶│ Kick OAuth Token │
└─────────────┘                           └──────────────────┘
       │                                           │
       │ auto-refresh si expira                    │ access_token
       ▼                                           ▼
┌─────────────────────────────────────────────────────────────┐
│  Loop principal del bot                                     │
│  1. WebSocket → escuchar mensajes (Pusher)                  │
│  2. Evaluar trigger (ej: "!comando")                        │
│  3. POST /chat → responder                                  │
└─────────────────────────────────────────────────────────────┘
```

### Ejemplo mínimo en Python

```python
import asyncio, httpx, json
from datetime import datetime, timedelta

class KickBot:
    BASE = "https://api.kick.com/public/v1"

    def __init__(self, access_token, refresh_token, client_id, client_secret, broadcaster_id):
        self.token = access_token
        self.refresh = refresh_token
        self.client_id = client_id
        self.client_secret = client_secret
        self.broadcaster_id = broadcaster_id
        self.token_expires = datetime.now() + timedelta(hours=1)

    async def ensure_token(self):
        if datetime.now() >= self.token_expires:
            async with httpx.AsyncClient() as client:
                r = await client.post("https://id.kick.com/oauth/token", data={
                    "grant_type": "refresh_token",
                    "client_id": self.client_id,
                    "client_secret": self.client_secret,
                    "refresh_token": self.refresh,
                })
                data = r.json()
                self.token = data["access_token"]
                self.refresh = data["refresh_token"]  # guardar siempre el nuevo
                self.token_expires = datetime.now() + timedelta(seconds=data["expires_in"])

    async def send(self, message: str):
        await self.ensure_token()
        async with httpx.AsyncClient() as client:
            await client.post(f"{self.BASE}/chat",
                headers={"Authorization": f"Bearer {self.token}"},
                json={
                    "broadcaster_user_id": self.broadcaster_id,
                    "content": message,
                    "type": "bot"
                }
            )
```

### Con `kick-js` (TypeScript/Node)

```typescript
import { createClient } from "@retconned/kick-js";

const client = createClient("nombre_canal", { logger: false, readOnly: false });

client.login({
  type: "tokens",
  credentials: {
    bearerToken: process.env.BEARER_TOKEN!,
    cookies: process.env.COOKIES!,
  },
});

client.on("ChatMessage", async (msg) => {
  if (msg.content.startsWith("!hola")) {
    await msg.reply(`¡Hola, ${msg.sender.username}!`);
  }
});
```

> ⚠️ `kick-js` usa tokens de sesión web (no OAuth oficial). Funciona pero es menos estable que el flujo OAuth 2.1.

---

## Resumen de endpoints usados

| Método | Endpoint | Para qué |
|--------|----------|---------|
| `GET` | `/public/v1/channels?broadcaster_user_login=X` | Obtener channel info + `broadcaster_user_id` |
| `POST` | `/public/v1/chat` | **Mandar mensaje** |
| `DELETE` | `/public/v1/chat/:message_id` | Borrar un mensaje (desde 02/12/2025) |
| `POST` | `https://id.kick.com/oauth/token` | Obtener/refrescar tokens |

---

## Notas finales

- La API pública de Kick es relativamente nueva (lanzada 2024) y sigue evolucionando rápido.
- Para producción: guardá tokens en variables de entorno o un vault, nunca hardcodeados.
- Rate limits: no están documentados públicamente, usá backoff exponencial.
- La documentación oficial vive en **[docs.kick.com](https://docs.kick.com)** y el repo **[KickEngineering/KickDevDocs](https://github.com/KickEngineering/KickDevDocs)**.
