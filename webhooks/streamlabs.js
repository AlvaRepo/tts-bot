import {
  createDonationNormalizer,
  createTokenAuthVerifier
} from './shared.js'

export const provider = 'streamlabs'

export const verifyStreamlabsAuth = createTokenAuthVerifier({
  provider,
  envName: 'STREAMLABS_WEBHOOK_TOKEN',
  headerNames: ['x-streamlabs-token', 'x-streamlabs-signature', 'x-webhook-token', 'authorization'],
  bodyTokenPaths: ['verification_token', 'auth.token']
})

export const normalizeStreamlabs = createDonationNormalizer({
  provider,
  eventIdPaths: ['event_id', 'id', 'transaction.id', 'event.id'],
  deliveryIdPaths: ['delivery_id', 'transaction.delivery_id'],
  donorNamePaths: ['donor_name', 'name', 'username', 'display_name', 'transaction.username'],
  amountPaths: ['amount', 'transaction.amount', 'amount.value', 'transaction.total'],
  textPaths: ['text', 'message', 'note', 'transaction.message', 'transaction.note']
})
