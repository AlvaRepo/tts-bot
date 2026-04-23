export const unresolvedProviderHeaderAssumptions = {
  paypal: [
    'Assumes a stable token can be passed via x-paypal-webhook-token, x-webhook-token, or authorization.',
    'If the deployment uses native PayPal signature verification, wire that at the edge adapter without changing the canonical event contract.'
  ],
  mercadopago: [
    'Assumes a stable token can be passed via x-mercadopago-webhook-token, x-mercadopago-signature, x-webhook-token, or authorization.',
    'If MercadoPago webhook verification uses a different header set, adapt only the auth shim.'
  ],
  streamlabs: [
    'Assumes a stable token can be passed via x-streamlabs-token, x-streamlabs-signature, x-webhook-token, or authorization.'
  ],
  streamelements: [
    'Assumes a stable token can be passed via x-streamelements-token, x-streamelements-signature, x-webhook-token, or authorization.'
  ],
  vip: [
    'Assumes VIP chatter events are trusted through a dedicated shared secret passed in x-vip-token, x-webhook-token, or authorization.'
  ]
}
