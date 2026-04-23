import {
  createDonationNormalizer,
  createTokenAuthVerifier
} from './shared.js'

export const provider = 'vip'

export const verifyVipAuth = createTokenAuthVerifier({
  provider,
  envName: 'VIP_CHAT_SECRET',
  headerNames: ['x-vip-token', 'x-webhook-token', 'authorization'],
  bodyTokenPaths: ['verification_token', 'auth.token']
})

export const normalizeVipChatter = createDonationNormalizer({
  provider,
  eventIdPaths: ['event_id', 'id', 'message_id', 'chat.id'],
  deliveryIdPaths: ['delivery_id', 'chat.delivery_id'],
  donorNamePaths: ['donor_name', 'name', 'username', 'display_name', 'chat.username'],
  amountPaths: ['amount', 'value', 'chat.amount', 'chat.value'],
  textPaths: ['text', 'message', 'note', 'chat.message', 'chat.note']
})
