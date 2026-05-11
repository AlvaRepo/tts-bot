# Proposal: Service Stability Hardening

## Intent

The TTS bot stops listening mid-session with no recovery. Service restarts are manual. Unhandled promise rejections, missing signal handlers, fragile WebSocket reconnect, and no graceful shutdown leave the process vulnerable to crashes, connection hangs, and silent failures.

## Scope

### In Scope
- Global error handlers (`unhandledRejection`, `uncaughtException`)
- OS signal handlers (`SIGTERM`, `SIGINT`) for graceful shutdown
- WebSocket reconnection with exponential backoff in `kick-bot-runner.js`
- Graceful shutdown orchestration (drain queue → close WS → close HTTP)
- Health-check endpoint (`/health`, `/ready`)

### Out of Scope
- Monitoring/alerting infra (Datadog, Sentry, etc.)
- Metrics collection (counter, histogram)
- Horizontal scaling / clustering
- Feature changes to TTS pipeline or bot commands

## Capabilities

### New Capabilities
- `process-resilience`: Global error boundary (`unhandledRejection`, `uncaughtException`), OS signal handling (`SIGTERM`, `SIGINT`), and graceful shutdown orchestration (queue drain, WS close, HTTP server close)
- `websocket-reconnect`: Automatic WebSocket reconnection for the Kick bot with exponential backoff, jitter, and max-retry ceiling

### Modified Capabilities
None — no existing specs.

## Approach

1. Create `src/process-resilience.js` — centralized module installing global error handlers, signal handlers, and a shutdown coordinator.
2. Wire shutdown into `server.js` — on signal, drain the queue, close the WebSocket server, stop the bot runner, then close the HTTP server with a timeout force-exit.
3. Add reconnect logic to `kick-bot-runner.js` — wrap `ws.onclose` to schedule reconnect with exponential backoff (1s, 2s, 4s, 8s… capped at 60s, with jitter). Reset on successful `ws.onopen`.
4. Add `/health` (liveness) and `/ready` (readiness) endpoints returning 200/503 with bot state.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `src/server.js` | Modified | Wire shutdown, add health endpoints, load resilience module |
| `kick-bot-runner.js` | Modified | Add reconnect logic with backoff |
| `src/process-resilience.js` | New | Centralized error/signal/shutdown module |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Reconnect loop burns rate limits | Med | Cap at 60s, add jitter, track consecutive failures |
| Global `uncaughtException` hides bugs | Low | Log full stack + exit after handler (don't swallow) |
| Shutdown timeout kills inflight TTS | Low | Drain queue first (max 45s per item) then force-exit |

## Rollback Plan

- Revert changes to `src/server.js` and `kick-bot-runner.js`
- Delete `src/process-resilience.js`
- Restart service — previous behavior restored in one deploy

## Dependencies

- Node.js `process` module (built-in) — no new npm deps

## Success Criteria

- [ ] `unhandledRejection` logged with full stack trace, process does not exit (or exits cleanly after log)
- [ ] SIGTERM triggers shutdown: drain queue → close WS → close HTTP in order
- [ ] WebSocket disconnect auto-reconnects within 65s max
- [ ] `/health` returns 200 when bot is connected, 503 otherwise
- [ ] Rollback deploys cleanly with no regression
