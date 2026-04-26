# Delta Spec - TTS_Free v1

## Intent
- Baseline spec for the TTS_Free project initialization and architecture.

## Scope
- Node.js Express server with WebSocket, Supabase DB, Edge TTS, and Pusher integration.
- Manual testing approach; no formal test framework detected.

## Requirements
- R1: Server exposes REST endpoints and WebSocket for real-time events.
- R2: Data persisted in Supabase; required tables exist.
- R3: Edge TTS is invoked for audio generation.
- R4: Kick chat integration via Pusher.
- R5: No automated tests; enable manual end-to-end verification.

## Scenarios
- S1: Start server and establish WebSocket connection.
- S2: Receive text input, generate audio via Edge TTS, and stream back.
- S3: Read/write data to Supabase.
- S4: Push/receive Kick chat messages via Pusher.
