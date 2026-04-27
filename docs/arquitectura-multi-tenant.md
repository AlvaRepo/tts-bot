# Arquitectura TTS Multi-tenant - Evaluación Completa

> **Objetivo:** Evaluar opciones técnicas y económicas para escalar el servicio TTS como producto comercial con múltiples clientes.

---

## 1. Estado Actual del Proyecto

### Lo que existe hoy

- Servidor Express + WebSocket
- Bot de Kick que escucha en UN canal (`KICK_BOT_CHANNEL`)
- TTS se reproduce en el canal del cliente (ya funciona)
- OAuth automático del cliente (ya implementado)
- Encriptación de refresh_token (ya implementado)

### Limitación actual

```
Un servidor = Un canal de chat escuchado = Un cliente a la vez
```

El WebSocket del bot solo puede subscribe a UN chatroom a la vez, por lo que actualmente solo puede atender a un cliente.

---

## 2. Modelos de Arquitectura

### 2.1 Opción A: Multi-tenant con DB Compartida (RECOMENDADA)

```
┌─────────────────────────────────────────────────────────────┐
│                        TU SERVIDOR                          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   DATABASE: Supabase                                        │
│   ┌─────────────────────────────────────────────────────┐   │
│   │ customers                                           │   │
│   │ ├── customer_1 (oauth + config + tier)             │   │
│   │ ├── customer_2 (oauth + config + tier)             │   │
│   │ └── customer_3 (oauth + config + tier)             │   │
│   └─────────────────────────────────────────────────────┘   │
│                                                             │
│   LÓGICA:                                                   │
│   ├── Identificar cliente por API key                      │
│   ├── Queue aislada por cliente                            │
│   ├── Rate limiting por cliente                            │
│   └── TTS → escribir en canal del cliente                 │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Pros:**
- Un solo servidor/deploy
- Costos predecibles y bajos
- Fácil mantenimiento y updates
- Compartir recursos de síntesis TTS
- Un solo punto de monitoreo

**Contras:**
- Riesgo de "noisy neighbor" (un cliente consume muchos recursos)
- Complejidad en lógica de aislamiento
- Un punto de fallo (si cae el servidor, caen todos)
- Requiere autenticación robusta

**Complejidad técnica:** ⭐⭐⭐⭐ (4/5)

---

### 2.2 Opción B: Instancias Separadas

```
┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
│   Servidor 1    │  │   Servidor 2    │  │   Servidor 3    │
│   Cliente A     │  │   Cliente B     │  │   Cliente C     │
│   $5-10/mes     │  │   $5-10/mes    │  │   $5-10/mes     │
└──────────────────┘  └──────────────────┘  └──────────────────┘
```

**Pros:**
- Aislamiento total (cliente no afecta a otros)
- Configuración 100% independiente
- Lógica simple (código actual sin cambios)
- Si uno cae, los demás funcionan

**Contras:**
- Costos multiplicados por cliente
- Mantenimiento difícil (actualizar N servidores)
- No escala automáticamente
- Cada servidor tiene overhead de DB

**Complejidad técnica:** ⭐⭐ (2/5) pero **no escala financieramente**

---

### 2.3 Opción C: Híbrido (Tier-based)

```
┌─────────────────────────────────────────────────────┐
│  PLAN FREE ($0)    →  Railway (compartido)         │
│  PLAN PRO ($5)     →  Railway dedicado            │
│  PLAN ENTERPRISE   →  Droplet propio              │
└─────────────────────────────────────────────────────┘
```

**Pros:**
- Balance costo/escalabilidad
- Upsell natural (cliente crece → migra a mejor tier)
- aislamientoprogresivo

**Contras:**
- Complejidad de gestión (múltiples proveedores)
- Migraciones entre tiers
- Monitoreo diferenciado

---

## 3. Análisis de Costos - Todos los Proveedores Gratuitos

### 3.1 Render (render.com)

| Recurso | Plan Free |
|---------|-----------|
| Horas/mes | 750 |
| RAM | 1GB |
| vCPU | 0.5 (compartido) |
| WebSocket | ❌ Inestable (se desconecta) |
| Sleep | 15 minutos de inactividad |
| Wake up time | ~30 segundos |
| Dominio SSL | ✅ Automatico |

**Veredicto:** ❌ **No viable para producción**
- El sleep de 15 min mata la experiencia
- WebSocket no es confiable
- Solo sirve para testing

---

### 3.2 Railway (railway.app)

| Recurso | Plan Free |
|---------|-----------|
| Crédito/mes | $5 (~500 horas compute) |
| RAM | 1GB |
| vCPU | 0.5 |
| WebSocket | ✅ Funciona |
| Sleep | 5 minutos inactividad |
| Dominio | ✅ .railway.app gratuito |

**Límites:**
- Se apaga después de 5 min inactivos
- 1 proyecto gratuito
- Build minutes limitados

**Veredicto:** ⚠️ **Viable para 1-3 clientes en modo free**
- Aceptable para-testing
- Para producción: $5/mes mínimo

---

### 3.3 Fly.io

| Recurso | Plan Free |
|---------|-----------|
| VMs compartidas | 3 |
| RAM/VM | Variable |
| Volumen | 3GB |
| WebSocket | ✅ Funciona |
| Sleep | ❌ No duerme |
| Distribución | Global (varios regions) |
| SSL | ✅ Automático |

**Veredicto:** ⭐ **Mejor opción gratuita para WebSocket**
- No tiene sleep
- Soporta WebSocket correctamente
- Distribución global
- Puede servir para free tier de verdad

---

### 3.4 Hetzner Cloud

| Recurso | Plan |
|---------|------|
| Plan free | ❌ No existe |
| Servidor más barato | €4/mes (CX11) |

**Specs del CX11:**
- 2 vCPU
- 2GB RAM
- 20GB SSD
- Transfer ilimitado

**Veredicto:** 💰 **Mejor opción económica ($4/mes)**
- No es gratuito pero es muy barato
- Muy buena relación precio/rendimiento
- Europa principalmente (menor latencia LATAM)

---

### 3.5 DigitalOcean

| Recurso | Plan |
|---------|------|
| Plan free | ❌ No existe |
| Droplet básico | $4/mes (0.5GB RAM) - **Descontinuado** |
| Droplet real | $12/mes (1GB RAM) |

**Veredicto:** 💰 **Opción premium**
- Más caro que Hetzner
- Mejor documentación
- Más features (Kubernetes, etc.)

---

### 3.6 Resumen Comparativo

| Proveedor | WebSocket | Costo/Mes | Clientes Soportados | Veredicto |
|-----------|-----------|-----------|--------------------:|-----------|
| Render | ❌ | $0 | 0 | ❌ No viable |
| Railway | ✅ | $0-5 | 1-3 | ⚠️ Testing |
| Fly.io | ✅ | $0 | 2-5 | ⭐ Mejor free |
| Hetzner | ✅ | €4 | 5-15 | 💰 Mejor valor |
| DigitalOcean | ✅ | $12 | 10-30 | 💰 Premium |

---

## 4. Modelo de Negocio Propuesto

### 4.1 Estructura de Tiers

#### Tier 1: Free (Freemium)
- **Precio:** $0
- **Límites:**
  - 5 mensajes TTS/día
  - Solo voz por defecto
  - Overlay con watermark
- **Target:** Streamers pequeños que quieren probar
- **Costo servidor:** $0 (usa plan free de Railway o Fly.io)
- **Margen:** $0 (pero capta usuarios)

---

#### Tier 2: Pro
- **Precio:** $5-10 USD/mes
- **Incluye:**
  - TTS ilimitado
  - Todas las voces disponibles
  - Presets de emoción
  - Overlay sin watermark
  - Configuración de volumen
  -cola prioritaria
- **Target:** Streamers regulares
- **Costo servidor:** $5/mes (Railway Pro o Hetzner)
- **Margen:** $0-5/mes por cliente

---

#### Tier 3: Enterprise
- **Precio:** $20-50 USD/mes
- **Incluye:**
  - Todo lo de Pro
  - Múltiples canales (Twitch + Kick)
  - API Access
  - Cola dedicada (sin competencia)
  - Soporte prioritario
  - Personalización completa
- **Target:** Agencias, streamers profesionales
- **Costo servidor:** $12-20/mes (Droplet + DB dedicada)
- **Margen:** $10-40/mes por cliente

---

### 4.2 Proyección de Ingresos

| Clientes Free | Clientes Pro ($5) | Clientes Enterprise ($25) | Ingreso Mensual | Costo Servidor (Hetzner) |
|--------------:|------------------:|-------------------------:|----------------:|-------------------------:|
| 100 | 5 | 0 | $25 | ~€10 + DB |
| 500 | 20 | 2 | $150 | ~€20 + DB |
| 1000 | 50 | 5 | $375 | ~€30 + DB |
| 5000 | 100 | 10 | $900 | ~€60 +负载均衡器 |

---

## 5. Roadmap de Implementación

### Fase 1: Estructura de Datos (1-2 días)

**Objetivo:** Crear schema multi-tenant en Supabase

```sql
-- Tabla de clientes
CREATE TABLE customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMP DEFAULT NOW(),
  
  -- Identificación
  api_key TEXT UNIQUE,  -- Para autenticar requests
  subdomain TEXT,      -- cliente.tudominio.com
  
  -- OAuth del cliente (para escribir en su canal de Kick)
  kick_access_token TEXT,
  kick_refresh_token_encrypted TEXT,
  kick_broadcaster_id INTEGER,
  kick_username TEXT,
  kick_chatroom_id INTEGER,
  
  -- Configuración TTS
  voice_pref TEXT DEFAULT 'es-AR-TomasNeural',
  preset_pref TEXT DEFAULT 'neutral',
  max_message_length INTEGER DEFAULT 300,
  
  -- Tier
  tier TEXT DEFAULT 'free' CHECK (tier IN ('free', 'pro', 'enterprise')),
  messages_this_month INTEGER DEFAULT 0,
  messages_limit INTEGER DEFAULT 5,
  
  -- Estado
  active BOOLEAN DEFAULT true,
  
  -- Timestamps
  last_tts_at TIMESTAMP
);

-- Tabla de uso (para billing)
CREATE TABLE usage_logs (
  id UUID PRIMARY KEY,
  customer_id UUID REFERENCES customers(id),
  messages_count INTEGER,
  period_start DATE,
  period_end DATE
);
```

---

### Fase 2: Middleware de Autenticación (1-2 días)

```javascript
// Middleware para identificar cliente por API key
async function authenticateClient(req, res, next) {
  const apiKey = req.headers['x-api-key'] || req.query.api_key
  
  if (!apiKey) {
    return res.status(401).json({ error: 'API key requerida' })
  }
  
  const { data: customer } = await supabase
    .from('customers')
    .select('*')
    .eq('api_key', apiKey)
    .single()
  
  if (!customer) {
    return res.status(401).json({ error: 'API key inválida' })
  }
  
  if (!customer.active) {
    return res.status(403).json({ error: 'Cuenta suspendida' })
  }
  
  req.customer = customer
  next()
}
```

---

### Fase 3: Rate Limiting por Cliente (2-3 días)

```javascript
// Rate limiter por cliente
const clientQueues = new Map() // customer_id → queue

function getClientQueue(customerId) {
  if (!clientQueues.has(customerId)) {
    clientQueues.set(customerId, {
      messages: [],
      processing: false,
      lastReset: Date.now()
    })
  }
  return clientQueues.get(customerId)
}

// Verificar límite según tier
function checkLimit(customer) {
  const now = Date.now()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  
  if (customer.messages_this_month >= customer.messages_limit) {
    throw new Error('Límite mensual alcanzado. Upgrade a Pro.')
  }
  
  return true
}
```

---

### Fase 4: OAuth por Cliente (2-3 días)

```javascript
// Generar URL de OAuth para cliente específico
app.get('/api/customers/oauth-url', authenticateClient, async (req, res) => {
  const state = `${req.customer.id}:${generateRandomState()}`
  const codeVerifier = await generateCodeVerifier()
  
  // Guardar code_verifier asociado al cliente
  await supabase
    .from('oauth_sessions')
    .insert({ customer_id: req.customer.id, code_verifier: codeVerifier })
  
  const url = buildOAuthUrl({
    client_id: KICK_CLIENT_ID,
    redirect_uri: CUSTOMER_CALLBACK_URL,
    state,
    code_challenge: await generateCodeChallenge(codeVerifier)
  })
  
  res.json({ url, state })
})
```

---

### Fase 5: Despliegue y Testing (2-3 días)

- Desplegar a Railway Pro o Hetzner
- Configurar dominio
- Tests de carga
- Monitoreo

---

## 6. Detalle Técnico: Identificación de Cliente

### Método 1: API Key en Header

```bash
curl -H "x-api-key: tu_api_key" https://tu-servidor.com/api/tts \
  -d '{"text": "Hola mundo"}'
```

### Método 2: Subdomain

```
https://tu-cliente.tu-dominio.com/api/tts
```

### Método 3: JWT Token

```javascript
// Cliente genera token con su API key
const token = jwt.sign({ customer_id: customer.id }, SECRET)
// Pasa en header Authorization: Bearer <token>
```

**Recomendación:** Empezar con API Key (método 1) por simplicidad.

---

## 7. Costos Reales por Escala

### Escenario: 100 clientes activos

| Recurso | Proveedor | Costo |
|---------|-----------|------:|
| Compute | Hetzner (CX22 - 4GB RAM) | €6/mes |
| DB | Supabase Pro | $25/mes |
| Dominio | Namecheap | $10/mes |
| SSL | Gratis (Let's Encrypt) | $0 |
| **Total** | | **$41/mes** |

**Margen con 10 clientes Pro ($5):** $50 - $41 = **$9/mes de ganancia**

---

### Escenario: 500 clientes activos

| Recurso | Proveedor | Costo |
|---------|-----------|------:|
| Compute | Hetzner (CX32 - 8GB RAM) | €14/mes |
| DB | Supabase Pro | $25/mes |
| Dominios adicionales | $2/mes cada uno | $0-10 |
| CDN (opcional) | Cloudflare | $0 |
| **Total** | | **$39-49/mes** |

---

### Escenario: 1000+ clientes

| Recurso | Proveedor | Costo |
|---------|-----------|------:|
| Compute | 2x Droplets (负载均衡) | $48/mes |
| DB | Supabase Team | $80/mes |
| CDN | Cloudflare Pro | $20/mes |
| Monitoreo | Datadog | $15/mes |
| **Total** | | **~$163/mes** |

**Margen:** ~$350-400/mes

---

## 8. Recomendación Final

### Para empezar (0-50 clientes)

1. **Servidor:** Railway Pro ($5/mes) o Hetzner (€4/mes)
2. **DB:** Supabase Free → Pro cuando crezca ($25/mes)
3. **Dominio:** Tu dominio actual con subdomains para clientes
4. **Arquitectura:** Multi-tenant (Opción A)

### Para escalar (50-500 clientes)

1. **Servidor:** Hetzner CX22 o CX32
2. **DB:** Supabase Pro con read replicas
3. **Cache:** Redis para rate limiting (Railway Redis plugin)

### Para producción (500+ clientes)

1. **Compute:** Multiple Droplets + Load Balancer
2. **DB:** Dedicated PostgreSQL
3. **CDN:** Cloudflare Enterprise

---

## 9. Factores de Riesgo

| Riesgo | Probabilidad | Impacto | Mitigación |
|--------|--------------:|--------:|------------|
| Un cliente consume todos los recursos | Media | Alto | Rate limiting estricto |
| Proveedor cierra/free tier cambia | Baja | Alto | Multi-cloud |
| DB se convierte en bottleneck | Media | Medio | Read replicas, caché |
| Latencia alta para clientes lejos | Media | Medio | CDN, múltiples regions |

---

## 10. Próximos Pasos Inmediatos

1. ✅ Definir modelo de tier (este documento)
2. ⬜ Crear tabla `customers` en Supabase
3. ⬜ Implementar middleware de autenticación
4. ⬜ Agregar límite de mensajes por tier
5. ⬜ Testing con 2-3 clientes
6. ⬜ Desplegar a servidor de producción

---

*Documento creado: 2026-04-27*
*Para el proyecto TTS Free de Kick Bot*