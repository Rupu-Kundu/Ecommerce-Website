import api from './api'

/**
 * List products.
 * @param {object} params - { search, category, ordering, page }
 * @returns {Promise<{count, next, previous, results}>}
 */
export async function getProducts(params = {}) {
  // Drop empty values so the URL stays clean.
  const clean = Object.fromEntries(
    Object.entries(params).filter(([, v]) => v !== '' && v !== null && v !== undefined),
  )
  const { data } = await api.get('/products/', { params: clean })
  return data
}

export async function getProduct(id) {
  const { data } = await api.get(`/products/${id}/`)
  return data
}

export async function getCategories() {
  const { data } = await api.get('/categories/')
  return data
}
