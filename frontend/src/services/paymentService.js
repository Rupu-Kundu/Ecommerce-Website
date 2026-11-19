import api from './api'

// The browser never sends or sees card details or secret keys. With Stripe the
// customer pays on Stripe's hosted page; the server then verifies the result.

/** {provider: 'stripe' | 'demo', currency, test_mode} */
export async function getPaymentConfig() {
  const { data } = await api.get('/payments/config/')
  return data
}

/** Start paying for an order → {provider, session_id, checkout_url, order_id} */
export async function createPaymentSession(orderId) {
  const { data } = await api.post('/payments/session/', { order_id: orderId })
  return data
}

/** Ask the server to verify a payment → {payment, order, detail} */
export async function confirmPayment(sessionId) {
  const { data } = await api.post('/payments/confirm/', { session_id: sessionId })
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
