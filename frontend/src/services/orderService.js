import api from './api'

/** Create an order from the cart. payload: {shipping_method, address | address_id} */
export async function createOrder(payload) {
  const { data } = await api.post('/orders/', payload)
  return data
}

/** Order history (paginated: {count, next, previous, results}). */
export async function getOrders(page = 1) {
  const { data } = await api.get('/orders/', { params: page > 1 ? { page } : {} })
  return data
}

export async function getOrder(id) {
  const { data } = await api.get(`/orders/${id}/`)
  return data
}

/** Cancel your own cash-on-delivery order (until it ships) → updated order */
export async function cancelOrder(id) {
  const { data } = await api.post(`/orders/${id}/cancel/`)
  return data
}
