# Improve Command Responses Spec (Delta)

## Intent
- Rewrite all command response messages to be user-friendly and explanatory, with each command (except !pokemon) explaining what it does.
- Store in hybrid mode: Engram (memory) + OpenSpec (documented spec).

## Scope
- Affects all command response handlers in the system.
- Exclude the special command !pokemon.

## Template and Style
- Use a consistent structure for all responses:
  - What it does
  - How to use
  - What to expect
  - Examples
- Tone: friendly, approachable, with minimal jargon.
- Internationalization: prep for i18n; separate keys for translations.

## Requirements
- R1: For every command (except !pokemon), responses include sections:
  - What it does
  - How to use
  - What to expect
  - Examples
- R2: One template per command; templates share common structure but can customize specifics.
- R3: Unknown commands: provide a generic help message pointing to help or docs.
- R4: Error handling: if command fails, provide friendly explanation + error code.
- R5: Translation hooks: include i18n keys; keep default English text.
- R6: Testing: unit/integration tests verify presence of required sections and tone.
- R7: Performance: messages must be constructed efficiently; avoid heavy formatting.
- R8: Accessibility: messages should be readable by screen readers; avoid heavy symbols.
- R9: Security: avoid leaking secrets; sanitize dynamic values.
- R10: Observability: include a request-id or trace-id for troubleshooting.

## Commands Coverage
- The following commands should be updated (non-exhaustive; identify all at implement time):
  - help
  - generate
  - summarize
  - analyze
  - run
  - stop
  - status
  - config
  - reset
  - update
  - fetch
  - train
  - deploy
  - test
- Exception: !pokemon remains unchanged.

## Acceptance Criteria
- AC1: All non-pokemon commands return messages with the required sections.
- AC2: The responses are consistent across commands (structure and tone).
- AC3: No leakage of sensitive data in responses.
- AC4: Tests pass and reflect the new spec.
- AC5: Engram stores a summary entry and OpenSpec file reflects the spec.

## Open Questions
- Should we include a per-command migration plan or just a global template?
- How to handle extremely long outputs in a single response while keeping readability?
