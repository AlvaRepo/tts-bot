import express from 'express'
import { claimWebhookDelivery, markWebhookDeliveryProcessed, releaseWebhookDelivery } from '../db.js'
import { unresolvedProviderHeaderAssumptions } from './notes.js'
import { deriveDedupeKey } from './shared.js'
import { provider as paypalProvider, verifyPayPalAuth, normalizePayPal } from './paypal.js'
import { provider as mercadoPagoProvider, verifyMercadoPagoAuth, normalizeMercadoPago } from './mercadopago.js'
import { provider as streamlabsProvider, verifyStreamlabsAuth, normalizeStreamlabs } from './streamlabs.js'
import { provider as streamElementsProvider, verifyStreamElementsAuth, normalizeStreamElements } from './streamelements.js'
import { provider as vipProvider, verifyVipAuth, normalizeVipChatter } from './vip.js'

function jsonError(res, status, error) {
  return res.status(status).json({ error })
}

function buildWebhookHandler({ provider, verifyAuth, normalize, enqueueMessage }) {
  return async function webhookHandler(req, res) {
    const auth = verifyAuth({ headers: req.headers, body: req.body, env: process.env })
    if (!auth.ok) return jsonError(res, auth.status ?? 401, auth.error ?? 'unauthorized')

    const normalized = normalize({ headers: req.headers, body: req.body, env: process.env })
    if (!normalized.ok) return jsonError(res, normalized.status ?? 400, normalized.error ?? 'invalid payload')

    const event = normalized.event
    const dedupeKey = deriveDedupeKey(provider, event.provider_event_id, event.provider_delivery_id)
    if (!dedupeKey) return jsonError(res, 400, 'missing stable provider event id')

    const claim = claimWebhookDelivery({
      provider,
      dedupe_key: dedupeKey,
      source: event.source,
      provider_event_id: event.provider_event_id,
      provider_delivery_id: event.provider_delivery_id,
      payload_json: JSON.stringify({
        provider: event.provider,
        donor_name: event.donor_name,
        amount: event.amount,
        text: event.text
      })
    })

    if (!claim.claimed) {
      return res.status(200).json({ ok: true, duplicate: true, provider, dedupe_key: dedupeKey })
    }

    try {
      const message = enqueueMessage({
        source: 'webhook',
        donor_name: event.donor_name,
        amount: event.amount,
        text: event.text
      })

      markWebhookDeliveryProcessed(provider, dedupeKey, message.id)
      return res.status(200).json({ ok: true, duplicate: false, id: message.id, provider })
    } catch (error) {
      releaseWebhookDelivery(provider, dedupeKey)
      return jsonError(res, error.statusCode ?? 500, error.message)
    }
  }
}

export function createDonationWebhookRouter({ enqueueMessage, env = process.env } = {}) {
  if (typeof enqueueMessage !== 'function') {
    throw new Error('createDonationWebhookRouter requires enqueueMessage')
  }

  const router = express.Router()

  router.get('/', (_req, res) => {
    res.json({
      ok: true,
      providers: [paypalProvider, mercadoPagoProvider, streamlabsProvider, streamElementsProvider, vipProvider]
    })
  })

  router.get('/notes', (_req, res) => {
    res.json(unresolvedProviderHeaderAssumptions)
  })

  router.post('/paypal', buildWebhookHandler({ provider: paypalProvider, verifyAuth: verifyPayPalAuth, normalize: normalizePayPal, enqueueMessage, env }))
  router.post('/mercadopago', buildWebhookHandler({ provider: mercadoPagoProvider, verifyAuth: verifyMercadoPagoAuth, normalize: normalizeMercadoPago, enqueueMessage, env }))
  router.post('/streamlabs', buildWebhookHandler({ provider: streamlabsProvider, verifyAuth: verifyStreamlabsAuth, normalize: normalizeStreamlabs, enqueueMessage, env }))
  router.post('/streamelements', buildWebhookHandler({ provider: streamElementsProvider, verifyAuth: verifyStreamElementsAuth, normalize: normalizeStreamElements, enqueueMessage, env }))
  router.post('/vip', buildWebhookHandler({ provider: vipProvider, verifyAuth: verifyVipAuth, normalize: normalizeVipChatter, enqueueMessage, env }))

  return router
}

export {
  unresolvedProviderHeaderAssumptions,
  verifyPayPalAuth,
  verifyMercadoPagoAuth,
  verifyStreamlabsAuth,
  verifyStreamElementsAuth,
  verifyVipAuth,
  normalizePayPal,
  normalizeMercadoPago,
  normalizeStreamlabs,
  normalizeStreamElements,
  normalizeVipChatter
}
