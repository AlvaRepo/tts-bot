# Design: Service Stability Hardening

## Technical Approach

Add a resilience layer across three areas: (1) global error/signal handling via a new `process-resilience.js` module, (2) graceful shutdown orchestration wired into `server.js`, (3) automatic WebSocket reconnection in `kick-bot-runner.js`. No new npm dependencies — all capabilities use built-in Node.js `process`, `http`, and `ws` APIs. Based on the proposal: global error handlers (`unhandledRejection`, `uncaughtException`), OS signals (`SIGTERM`, `SIGINT`), health endpoints (`/health`, `/ready`), and WS reconnect with exponential backoff.

## Architecture Decisions

### Decision: Create `src/process-resilience.js` instead of inlining in server.js

| Option | Tradeoff | Decision |
|--------|----------|----------|
| Inline in server.js | Less indirection, but server.js is already 890 lines of routing logic | ❌ |
| New module `process-resilience.js` | Isolates cross-cutting concern, independently testable, keeps server.js focused on HTTP | ✅ |

### Decision: `uncaughtException` logs then exits

| Option | Tradeoff | Decision |
|--------|----------|----------|
| Keep process alive | Node.js docs warn the app is in unknown state — risk of silent corruption | ❌ |
| Log + `process.exit(1)` | Captures diagnostic data before clean exit. Follows Node.js best practice. | ✅ |

### Decision: Reconnect with exponential backoff + full jitter

| Option | Tradeoff | Decision |
|--------|----------|----------|
| Linear retry (every 5s) | Predictable but thundering herd if many clients reconnect | ❌ |
| Exponential backoff + jitter | 1s, 2s, 4s… up to 60s cap with `delay * rand(0.5,1.5)`. Avoids burst, gives network time to recover. | ✅ |

### Decision: Shutdown order — bot → queue → WS → HTTP

| Option | Tradeoff | Decision |
|--------|----------|----------|
| Kill everything immediately | In-flight TTS audio is lost, overlay clients get broken pipe | ❌ |
| Drain queue → stop bot → close WS → close HTTP → force exit after 30s | In-flight message finishes, overlay disconnect is clean, process doesn't hang on stuck TTS | ✅ |

## Data Flow

```
SIGTERM/SIGINT ──► createResilience.shutdown()
                     │
                     ├── kickBotRunner.stop()     ← close Kick Pusher WS
                     ├── queue.control('stop')    ← flush pending, skip current
                     ├── wss.close()              ← disconnect overlay clients
                     ├── server.close()           ← stop HTTP listener
                     └── setTimeout(forceExit, 30s) ← hard kill if TTS hangs

WebSocket disconnect ──► ws.onclose
                          ├── if shuttingDown → return (no reconnect during shutdown)
                          ├── if retries >= MAX_RETRIES → log permanent failure
                          └── else → schedule reconnect(delay)
                               delay = min(60s, 1000 * 2^attempt)
                               delay *= (0.5 + Math.random() * 0.5)  // full jitter
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `src/process-resilience.js` | Create | Global error handlers, signal handlers, shutdown orchestrator, health check helpers |
| `src/server.js` | Modify | Import `createResilience`, inject server/ws/bot references, add `/health + /ready` routes |
| `kick-bot-runner.js` | Modify | Add `_reconnect()` with exponential backoff in `ws.onclose`, track `_shuttingDown` flag |
| `test/smoke.js` | Modify | Add `/health`, `/ready` endpoint assertions in `testSystemRoutes` |

## Interfaces / Contracts

```javascript
// src/process-resilience.js — exported function
export function createResilience({ server, wss, kickBotRunner, queue, logger = console }) {
  return {
    shutdown: () => Promise<void>,            // orchestrated graceful shutdown
    health: () => ({ status: 'ok', uptime }), // liveness
    ready: () => ({ status, connected, uptime }) // readiness
  }
}
```

**Health endpoints** (registered on `app` in server.js):

```
GET /health → 200 { status: 'ok', uptime: 1234 }
GET /ready  → 200 { status: 'ok', connected: true, uptime: 1234 }
           → 503 { status: 'not ready', connected: false, uptime: 1234 }
```

**Bot reconnect** (`kick-bot-runner.js`):

```javascript
// Internal changes only — no new exported methods
// ws.onclose in start() triggers _reconnect()
// _reconnect() schedules setTimeout with exponential backoff @ 1s..60s, max 15 retries
// On ws.onopen: reset attempt counter, subscribe to chatroom
```

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit | Reconnect delay function | Pure function: verify delays grow exponentially with jitter within expected range |
| Unit | `createResilience()` health shape | Mock server/wss/bot, assert `/health` and `/ready` return correct status and fields |
| Integration | `/health` + `/ready` endpoints | Extend `testSystemRoutes` in smoke.js — start server, hit both endpoints, verify 200/503 |
| Integration | SIGTERM graceful shutdown | Spawn server, send SIGTERM, assert process exits within 35s and logs show orderly drain |
| Manual | WS reconnect | Disconnect network, verify reconnect logs appear, verify bot resumes after network restoration |

## Migration / Rollout

No migration required. All changes are additive and backwards-compatible:

1. Create `src/process-resilience.js`
2. Modify `src/server.js` and `kick-bot-runner.js`
3. Run smoke tests: `node test/smoke.js`
4. Deploy, verify `/health` returns 200 and `/ready` reflects bot state
5. Send SIGTERM to process, verify graceful shutdown logs and clean exit

Rollback: revert changed files, delete new file, restart.

## Open Questions

- [ ] What is the observed WebSocket disconnection pattern? Is it network blips (fast reconnect OK) or auth expiry (needs token refresh)? Reconnect currently retries the same connection — may need to re-auth if Pusher token expires.
