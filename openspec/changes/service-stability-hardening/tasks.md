# Tasks: Service Stability Hardening

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~170–210 |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | Single PR |
| Delivery strategy | auto-chain |
| Chain strategy | feature-branch-chain |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: feature-branch-chain
400-line budget risk: Low

## Phase 1: Process Resilience Module (New File)

- [x] 1.1 Create `src/process-resilience.js` �?" `export function createResilience({ server, wss, kickBotRunner, queue, logger })` with global error handlers (`unhandledRejection` log, `uncaughtException` log + `process.exit(1)`), OS signal handlers (`SIGTERM`, `SIGINT`) wired to `shutdown()`, a shutdown orchestrator that drains queue �+' stops bot �+' closes WSS �+' closes HTTP �+' force-exit after 30s, and health/ready helper objects returning `{ status, uptime }` + `{ status, connected, uptime }`
- [x] 1.2 Verify `process-resilience.js` exports the expected interface with no side effects at import time (all setup happens at `createResilience()` call)

## Phase 2: Wire Resilience Into Server

- [x] 2.1 In `src/server.js`, import `createResilience` and call it after `server.listen()` passing `{ server, wss, kickBotRunner, queue }`, storing the returned resilience object
- [x] 2.2 Add `GET /health` route (returns 200 with resilience.health()) and `GET /ready` route (returns 200 with resilience.ready() when bot connected, 503 otherwise)
- [x] 2.3 In `src/server.js`, remove the inline `void kickBotRunner.start().catch(...)` — the signal handler shutdown flow now orchestrates the bot lifecycle; keep bot start but ensure resilience.shutdown() can stop it

## Phase 3: WebSocket Reconnection in Kick Bot Runner

- [x] 3.1 In `kick-bot-runner.js`, add `_shuttingDown = false` flag and an `_attempt = 0` counter in the closure; expose a `setShuttingDown()` method
- [x] 3.2 Replace the bare `ws.onclose = () => { ... }` handler: set `_attempt++`, if `_shuttingDown` or `_attempt >= 15` log permanent failure and return, otherwise schedule reconnect with `delay = Math.min(60000, 1000 * 2 ** _attempt) * (0.5 + Math.random() * 0.5)` then call `start()` (which creates a new WebSocket)
- [x] 3.3 Reset `_attempt = 0` in the `ws.onopen` handler; ensure `start()` can be called multiple times safely (close stale ws if any before creating new one)
- [x] 3.4 In `kick-bot-runner.js`, wire `_shuttingDown = true` into the `stop()` method so reconnection is suppressed during graceful shutdown

## Phase 4: Testing / Verification

- [x] 4.1 In `test/smoke.js`, add assertions to `testSystemRoutes`: fetch `/health` �+' 200 with `{ status: 'ok' }`, fetch `/ready` �+' 200 or 503 with `status` field present
- [x] 4.2 Verify graceful shutdown path: run smoke tests, confirm killing the spawned server process logs "shutdown initiated", "queue drained", "WS closed", "HTTP closed" to stderr/stdout
