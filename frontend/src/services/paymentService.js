import api from './api'

// The browser never sends or sees card details or secret keys. With Stripe the
// customer pays on Stripe's hosted page; the server then verifies the result.

/** {currency, methods: [{code: 'card' | 'bkash' | 'nagad', label, provider, available, demo}]} */
export async function getPaymentConfig() {
  const { data } = await api.get('/payments/config/')
  return data
}

/** Start paying for an order → {provider, session_id, checkout_url, order_id} */
export async function createPaymentSession(orderId) {
  const { data } = await api.post('/payments/session/', { order_id: orderId })
  return data
}

/**
 * Ask the server to verify a payment → {payment, order, detail}.
 * providerStatus: bKash's ?status= (success | failure | cancel) from the redirect, if any.
 */
export async function confirmPayment(sessionId, providerStatus) {
  const { data } = await api.post('/payments/confirm/', { session_id: sessionId, ...(providerStatus && { status: providerStatus }) })
  return data
}

/** Cash on delivery: confirm the order without paying online → {order_id, status, payment_status, amount_due} */
export async function placeCodOrder(orderId) {
  const { data } = await api.post('/payments/cod/', { order_id: orderId })
  return data
}

export async function cancelPayment(orderId) {
  const { data } = await api.post('/payments/cancel/', { order_id: orderId })
  return data
}

/** Demo test gateway only: outcome = 'success' | 'failure' */
export async function completeDemoPayment(sessionId, outcome) {
  const { data } = await api.post('/payments/demo/complete/', { session_id: sessionId, outcome })
  return data
}
