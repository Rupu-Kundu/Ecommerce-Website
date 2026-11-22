import api from './api'

// Admin-only calls. The backend checks the admin role on every request —
// hiding the dashboard in the UI is a convenience, not the security boundary.

/** Dashboard numbers. days = 7 | 30 | 90 → all-time totals + that period vs the previous one. */
export async function getAdminStats(days = 30) {
  const { data } = await api.get('/admin/stats/', { params: { days } })
  return data
}

// ---- Products ----
export async function getAdminProducts(params = {}) {
  const clean = Object.fromEntries(Object.entries(params).filter(([, v]) => v !== '' && v != null))
  const { data } = await api.get('/products/', { params: clean })
  return data
}

/** fields: {name, category, price, stock_quantity, description, is_available, image?: File} */
function toFormData(fields) {
  const form = new FormData()
  Object.entries(fields).forEach(([key, value]) => {
    if (value === undefined || value === null) return
    if (key === 'image' && !(value instanceof File)) return
    if (typeof value === 'object' && !(value instanceof Blob)) form.append(key, JSON.stringify(value)) // e.g. specifications
    else form.append(key, typeof value === 'boolean' ? String(value) : value)
  })
  return form
}

export async function createProduct(fields) {
  const { data } = await api.post('/products/', toFormData(fields))
  return data
}

export async function updateProduct(id, fields) {
  const { data } = await api.patch(`/products/${id}/`, toFormData(fields))
  return data
}

export async function deleteProduct(id) {
  await api.delete(`/products/${id}/`)
}

// ---- Categories ----
export async function createCategory(fields) {
  const { data } = await api.post('/categories/', fields)
  return data
}

export async function updateCategory(id, fields) {
  const { data } = await api.patch(`/categories/${id}/`, fields)
  return data
}

export async function deleteCategory(id) {
  await api.delete(`/categories/${id}/`)
}

// ---- Orders ----
export async function getAdminOrders(params = {}) {
  const clean = Object.fromEntries(Object.entries(params).filter(([, v]) => v !== '' && v != null))
  const { data } = await api.get('/orders/', { params: clean })
  return data
}

export async function updateOrderStatus(id, status) {
  const { data } = await api.patch(`/orders/${id}/status/`, { status })
  return data
}

/** Add a gallery photo to a product (multipart). */
export async function uploadProductImage(productId, file, altText = '') {
  const form = new FormData()
  form.append('image', file)
  if (altText) form.append('alt_text', altText)
  const { data } = await api.post(`/products/${productId}/images/`, form)
  return data
}

export async function deleteProductImage(productId, imageId) {
  await api.delete(`/products/${productId}/images/${imageId}/`)
}

// ---- Customers ----
/** params: {search, status: 'active'|'inactive', orders: 'with'|'without', joined: 7|30|90, ordering, page} */
export async function getAdminCustomers(params = {}) {
  const clean = Object.fromEntries(Object.entries(params).filter(([, v]) => v !== '' && v != null))
  const { data } = await api.get('/admin/customers/', { params: clean })
  return data
}

export async function getAdminCustomer(id) {
  const { data } = await api.get(`/admin/customers/${id}/`)
  return data
}
