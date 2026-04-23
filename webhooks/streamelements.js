import {
  createDonationNormalizer,
  createTokenAuthVerifier
} from './shared.js'

export const provider = 'streamelements'

export const verifyStreamElementsAuth = createTokenAuthVerifier({
  provider,
  envName: 'STREAMELEMENTS_WEBHOOK_TOKEN',
  headerNames: ['x-streamelements-token', 'x-streamelements-signature', 'x-webhook-token', 'authorization'],
  bodyTokenPaths: ['verification_token', 'auth.token']
})

export const normalizeStreamElements = createDonationNormalizer({
  provider,
  eventIdPaths: ['event_id', 'id', '_id', 'transactionId', 'tip.id'],
  deliveryIdPaths: ['delivery_id', 'event.delivery_id'],
  donorNamePaths: ['donor_name', 'name', 'username', 'display_name', 'tip.username'],
  amountPaths: ['amount', 'value', 'tip.amount', 'tip.value', 'transaction.amount'],
  textPaths: ['text', 'message', 'note', 'tip.message', 'tip.note']
})
