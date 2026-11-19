import api from './api'

export async function getShippingMethods() {
  const { data } = await api.get('/checkout/shipping-methods/')
  return data
}

export async function getSavedAddresses() {
  const { data } = await api.get('/checkout/addresses/')
  return data
}

/**
 * Ask the server to verify the cart and save the address.
 * @param {{shipping_method: string, address?: object, address_id?: number}} payload
 * @returns verified summary { address, items, subtotal, shipping_cost, total, ... }
 */
export async function submitCheckout(payload) {
  const { data } = await api.post('/checkout/', payload)
  return data
}

/** Same rule as the backend — used only to preview the total before the server confirms it. */
export function previewShippingCost(method, subtotal) {
  if (!method) return 0
  const freeOver = method.free_over === null ? null : Number(method.free_over)
  if (freeOver !== null && Number(subtotal) >= freeOver) return 0
  return Number(method.cost)
}
