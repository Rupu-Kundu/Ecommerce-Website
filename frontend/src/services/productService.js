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

/** Ratings & reviews → {summary: {average, count, distribution}, my_review, results} */
export async function getReviews(productId) {
  const { data } = await api.get(`/products/${productId}/reviews/`)
  return data
}

/** Add or update your review: {rating 1-5, comment} */
export async function saveReview(productId, review) {
  const { data } = await api.post(`/products/${productId}/reviews/`, review)
  return data
}

export async function deleteReview(productId, reviewId) {
  await api.delete(`/products/${productId}/reviews/${reviewId}/`)
}
