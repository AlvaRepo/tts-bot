import { randomUUID } from 'crypto'

function trimString(value) {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function normalizeToken(value) {
  const trimmed = trimString(Array.isArray(value) ? value[0] : value)
  if (!trimmed) return null
  const bearer = trimmed.match(/^Bearer\s+(.+)$/i)
  return bearer ? trimString(bearer[1]) : trimmed
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

export function getHeader(headers, name) {
  if (!headers || typeof headers !== 'object') return undefined
  const lower = name.toLowerCase()
  return headers[lower] ?? headers[name] ?? undefined
}

export function getFirstHeader(headers, names = []) {
  for (const name of names) {
    const value = getHeader(headers, name)
    const trimmed = normalizeToken(value)
    if (trimmed) return trimmed
  }
  return null
}

export function resolvePath(source, path) {
  if (!isPlainObject(source)) return undefined
  const parts = String(path).split('.')
  let current = source
  for (const part of parts) {
    if (!isPlainObject(current) && !Array.isArray(current)) return undefined
    if (!(part in current)) return undefined
    current = current[part]
    if (current === undefined || current === null) break
  }
  return current
}

export function firstResolved(source, paths = []) {
  for (const path of paths) {
    const value = resolvePath(source, path)
    if (value !== undefined && value !== null && value !== '') return value
  }
  return undefined
}

export function coerceAmountValue(value) {
  if (value === null || value === undefined || value === '') return null
  const candidate = typeof value === 'number' ? value : Number(String(value).replace(/[^0-9.,-]/g, '').replace(',', '.'))
  return Number.isFinite(candidate) ? candidate : null
}

export function resolveAmount(source, paths = []) {
  let sawValue = false
  for (const path of paths) {
    const value = resolvePath(source, path)
    if (value === undefined || value === null || value === '') continue
    sawValue = true
    const amount = coerceAmountValue(value)
    if (amount === null) return { amount: null, error: `amount inválido en ${path}` }
    return { amount, error: null }
  }
  return { amount: null, error: sawValue ? 'amount inválido' : null }
}

export function deriveDedupeKey(provider, providerEventId, providerDeliveryId) {
  const stable = trimString(providerEventId) ?? trimString(providerDeliveryId)
  return stable ? `${provider}:${stable}` : null
}

export function buildDonationText({ provider, donor_name, amount, text }) {
  const explicitText = trimString(text)
  if (explicitText) return explicitText

  const donor = trimString(donor_name) ?? provider
  const amountText = amount === null || amount === undefined ? '' : ` — ${Number(amount).toFixed(2)}`
  return `Donation from ${donor}${amountText}`
}

export function buildCanonicalDonationEvent({
  provider,
  provider_event_id = null,
  provider_delivery_id = null,
  donor_name = null,
  amount = null,
  text = null,
  source = 'webhook',
  raw = null,
  metadata = {}
}) {
  return {
    id: randomUUID(),
    provider,
    provider_event_id: trimString(provider_event_id),
    provider_delivery_id: trimString(provider_delivery_id),
    source,
    donor_name: trimString(donor_name),
    amount: amount === null || amount === undefined ? null : Number(amount),
    text: buildDonationText({ provider, donor_name, amount, text }),
    raw,
    metadata,
    created_at: Date.now()
  }
}

export function createNormalizationResult(event, notes = []) {
  return { ok: true, event, notes }
}

export function createNormalizationFailure(error, status = 400) {
  return { ok: false, status, error }
}

export function createAuthResult(ok, status, error) {
  return ok ? { ok: true } : { ok: false, status, error }
}

export function safeTokenEquals(actual, expected) {
  const a = trimString(actual)
  const b = trimString(expected)
  if (!a || !b) return false
  if (a.length !== b.length) return false
  let mismatch = 0
  for (let i = 0; i < a.length; i += 1) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return mismatch === 0
}

export function createTokenAuthVerifier({ provider, envName, headerNames = [], bodyTokenPaths = [] }) {
  return function verify({ headers = {}, body = {}, env = process.env } = {}) {
    const expected = trimString(env?.[envName])
    if (!expected) return createAuthResult(false, 401, `${provider} auth no configurada`)

    const headerToken = getFirstHeader(headers, headerNames)
    const bodyToken = trimString(firstResolved(body, bodyTokenPaths))
    const candidate = headerToken ?? bodyToken

    if (!safeTokenEquals(candidate, expected)) {
      return createAuthResult(false, 401, `${provider} auth inválida`)
    }

    return createAuthResult(true)
  }
}

export function createDonationNormalizer({
  provider,
  eventIdPaths = [],
  deliveryIdPaths = [],
  donorNamePaths = [],
  amountPaths = [],
  textPaths = [],
  metadataPaths = []
}) {
  return function normalize({ body = {}, headers = {}, env = process.env } = {}) {
    const provider_event_id = trimString(firstResolved(body, eventIdPaths)) ?? getFirstHeader(headers, [`x-${provider}-event-id`, 'x-event-id'])
    const provider_delivery_id = trimString(firstResolved(body, deliveryIdPaths)) ?? getFirstHeader(headers, [`x-${provider}-delivery-id`, 'x-delivery-id'])

    if (!provider_event_id && !provider_delivery_id) {
      return createNormalizationFailure(`${provider} requiere un id estable`, 400)
    }

    const donor_name = trimString(firstResolved(body, donorNamePaths))
    const amountResult = resolveAmount(body, amountPaths)
    if (amountResult.error) return createNormalizationFailure(amountResult.error, 400)

    const explicitText = trimString(firstResolved(body, textPaths))
    const event = buildCanonicalDonationEvent({
      provider,
      provider_event_id,
      provider_delivery_id,
      donor_name,
      amount: amountResult.amount,
      text: explicitText,
      raw: body,
      metadata: Object.fromEntries(
        metadataPaths
          .map(path => [path, firstResolved(body, [path])])
          .filter(([, value]) => value !== undefined && value !== null && value !== '')
      )
    })

    return createNormalizationResult(event)
  }
}
