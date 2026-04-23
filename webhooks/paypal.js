import {
  createDonationNormalizer,
  createTokenAuthVerifier
} from './shared.js'

export const provider = 'paypal'

export const verifyPayPalAuth = createTokenAuthVerifier({
  provider,
  envName: 'PAYPAL_WEBHOOK_TOKEN',
  headerNames: ['x-paypal-webhook-token', 'x-webhook-token', 'authorization'],
  bodyTokenPaths: ['verification_token', 'auth.token']
})

export const normalizePayPal = createDonationNormalizer({
  provider,
  eventIdPaths: ['event_id', 'id', 'resource.id', 'resource.parent_payment', 'resource.sale_id'],
  deliveryIdPaths: ['delivery_id', 'resource.delivery_id'],
  donorNamePaths: ['donor_name', 'payer.name.given_name', 'resource.payer.name.given_name', 'resource.payer_email', 'summary'],
  amountPaths: ['amount', 'resource.amount.total', 'resource.amount.value', 'resource.amount.gross_amount', 'resource.amount.net_amount'],
  textPaths: ['text', 'note', 'message', 'resource.note_to_payer', 'resource.description']
})
