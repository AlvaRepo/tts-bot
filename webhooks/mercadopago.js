import {
  createDonationNormalizer,
  createTokenAuthVerifier
} from './shared.js'

export const provider = 'mercadopago'

export const verifyMercadoPagoAuth = createTokenAuthVerifier({
  provider,
  envName: 'MERCADOPAGO_WEBHOOK_TOKEN',
  headerNames: ['x-mercadopago-webhook-token', 'x-mercadopago-signature', 'x-webhook-token', 'authorization'],
  bodyTokenPaths: ['verification_token', 'auth.token']
})

export const normalizeMercadoPago = createDonationNormalizer({
  provider,
  eventIdPaths: ['event_id', 'id', 'data.id', 'resource.id', 'data.payment.id'],
  deliveryIdPaths: ['delivery_id', 'data.delivery_id'],
  donorNamePaths: ['donor_name', 'payer.nickname', 'payer.first_name', 'payer.name', 'data.payer.nickname', 'data.payer.first_name'],
  amountPaths: ['amount', 'transaction_amount', 'data.transaction_amount', 'data.payment.transaction_amount', 'data.amount'],
  textPaths: ['text', 'message', 'note', 'description', 'data.description']
})
