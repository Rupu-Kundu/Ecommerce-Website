import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createCategory, deleteCategory, deleteProduct, getAdminOrders, getAdminPayments, getAdminProducts, getAdminStats, updateCategory,
  updateOrderStatus, updateProduct,
} from '../../services/adminService'
import { getOrder } from '../../services/orderService'
import { getCategories } from '../../services/productService'
import AdminCategoriesPage from './AdminCategoriesPage'
import AdminOrdersPage from './AdminOrdersPage'
import AdminProductsPage from './AdminProductsPage'

vi.mock('../../services/adminService', () => ({
  getAdminProducts: vi.fn(), getAdminStats: vi.fn(), deleteProduct: vi.fn(), updateProduct: vi.fn(), createProduct: vi.fn(),
  uploadProductImage: vi.fn(), deleteProductImage: vi.fn(),
  createCategory: vi.fn(), updateCategory: vi.fn(), deleteCategory: vi.fn(),
  getAdminOrders: vi.fn(), updateOrderStatus: vi.fn(), getAdminPayments: vi.fn(),
}))
vi.mock('../../services/productService', () => ({ getCategories: vi.fn() }))
vi.mock('../../services/orderService', () => ({ getOrder: vi.fn() }))
vi.mock('../../components/map/LazyMaps', () => ({ LazyLocationMap: () => null }))

const stats = { product_count: 65, hidden_product_count: 1, low_stock_count: 2, out_of_stock_count: 1, order_count: 6, orders_by_status: { pending: 0, paid: 2, processing: 1, shipped: 1, delivered: 1, cancelled: 1 } }
const cats = [
  { id: 1, name: 'Books', slug: 'books', description: '', product_count: 4 },
  { id: 2, name: 'Toys', slug: 'toys', description: 'Fun', product_count: 0 },
  { id: 3, name: 'Shoes', slug: 'shoes', description: '', product_count: 5 },
]
const product = (id, over = {}) => ({ id, name: `Product ${id}`, brand: 'Stride', category_name: 'Shoes', price: '4950.00', stock_quantity: 18, is_available: true, image: null, images: [{}], average_rating: null, rating_count: 0, ...over })
const order = (id, over = {}) => ({
  id, item_count: 1, created_at: '2026-11-20T10:00:00Z', total_amount: '2000.00', payment_method: 'card', payment_status: 'paid', payment_status_label: 'Paid',
  status: 'paid', status_label: 'Paid', customer: { id: 5, username: 'rupa', email: 'rupa@example.com' }, ...over,
})

function Where() {
  const l = useLocation()
  return <p data-testid="where">{l.search}</p>
}
function renderAt(path, element) {
  const route = path.split('?')[0]
  render(<MemoryRouter initialEntries={[path]}><Routes><Route path={route} element={<>{element}<Where /></>} /></Routes></MemoryRouter>)
}

beforeEach(() => {
  vi.mocked(getAdminStats).mockReset().mockResolvedValue(stats)
  vi.mocked(getCategories).mockReset().mockResolvedValue(cats)
})
afterEach(() => vi.restoreAllMocks())

describe('AdminProductsPage', () => {
  beforeEach(() => {
    vi.mocked(getAdminProducts).mockReset().mockResolvedValue({ count: 2, results: [product(1), product(2, { stock_quantity: 0, is_available: false })] })
    vi.mocked(updateProduct).mockReset().mockResolvedValue({})
    vi.mocked(deleteProduct).mockReset().mockResolvedValue()
  })

  it('shows summary chips and rows with stock/visibility badges', async () => {
    renderAt('/admin-dashboard/products', <AdminProductsPage />)
    expect(await screen.findByTestId('sum-products')).toHaveTextContent('65')
    expect(screen.getByTestId('sum-hidden')).toHaveTextContent('1')
    const rows = await screen.findAllByTestId('admin-product-row')
    expect(rows[1]).toHaveTextContent('Out of stock')
    expect(rows[1]).toHaveTextContent('Hidden')
    expect(getAdminProducts).toHaveBeenLastCalledWith(expect.objectContaining({ ordering: '-created_at', page: 1 }))
  })

  it('filters, sort and the old ?low_stock=true link', async () => {
    renderAt('/admin-dashboard/products?low_stock=true', <AdminProductsPage />)
    await screen.findAllByTestId('admin-product-row')
    expect(getAdminProducts).toHaveBeenLastCalledWith(expect.objectContaining({ low_stock: 'true', stock: '' }))
    expect(screen.getByLabelText('Stock')).toHaveValue('restock')
    fireEvent.change(screen.getByLabelText('Stock'), { target: { value: 'out' } })
    fireEvent.change(screen.getByLabelText('Visibility'), { target: { value: 'false' } })
    fireEvent.change(screen.getByLabelText('Sort by'), { target: { value: 'price' } })
    await waitFor(() => expect(getAdminProducts).toHaveBeenLastCalledWith(expect.objectContaining({ stock: 'out', low_stock: '', available: 'false', ordering: 'price' })))
    expect(screen.getByTestId('where')).toHaveTextContent('stock=out')
    fireEvent.click(screen.getByTestId('sum-restock'))
    await waitFor(() => expect(getAdminProducts).toHaveBeenLastCalledWith(expect.objectContaining({ low_stock: 'true', stock: '' })))
  })

  it('hide/show and delete (with confirmation) keep working', async () => {
    renderAt('/admin-dashboard/products', <AdminProductsPage />)
    const table = await screen.findByTestId('products-table') // jsdom has no CSS: table and phone cards both render
    fireEvent.click(within(table).getByRole('button', { name: 'Hide Product 1' }))
    await waitFor(() => expect(updateProduct).toHaveBeenCalledWith(1, { is_available: false }))
    expect(await screen.findByText('“Product 1” is now hidden from the store.')).toBeInTheDocument()
    vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true)
    fireEvent.click(within(screen.getByTestId('products-table')).getByRole('button', { name: 'Delete Product 2' }))
    expect(deleteProduct).not.toHaveBeenCalled()
    fireEvent.click(within(screen.getByTestId('products-table')).getByRole('button', { name: 'Delete Product 2' }))
    await waitFor(() => expect(deleteProduct).toHaveBeenCalledWith(2))
    expect(await screen.findByText('Deleted “Product 2”.')).toBeInTheDocument()
  })

  it('empty state', async () => {
    getAdminProducts.mockResolvedValue({ count: 0, results: [] })
    renderAt('/admin-dashboard/products?search=zzz', <AdminProductsPage />)
    expect(await screen.findByTestId('products-empty')).toHaveTextContent('No products match these filters')
  })
})

describe('AdminCategoriesPage', () => {
  beforeEach(() => {
    vi.mocked(createCategory).mockReset().mockResolvedValue({ id: 9, name: 'Garden' })
    vi.mocked(updateCategory).mockReset().mockResolvedValue({ id: 1, name: 'Novels' })
    vi.mocked(deleteCategory).mockReset()
  })

  it('summary, search, show-empty filter and sort work in the browser', async () => {
    renderAt('/admin-dashboard/categories', <AdminCategoriesPage />)
    expect(await screen.findByTestId('sum-categories')).toHaveTextContent('3')
    expect(screen.getByTestId('sum-empty')).toHaveTextContent('1')
    const names = () => screen.getAllByTestId('admin-category-row').map((r) => r.querySelector('p.font-semibold').textContent)
    expect(names()).toEqual(['Books', 'Shoes', 'Toys'])
    fireEvent.change(screen.getByLabelText('Sort by'), { target: { value: 'products' } })
    await waitFor(() => expect(names()).toEqual(['Shoes', 'Books', 'Toys']))
    fireEvent.click(screen.getByTestId('sum-empty'))
    await waitFor(() => expect(screen.getAllByTestId('admin-category-row')).toHaveLength(1))
    expect(screen.getByTestId('where')).toHaveTextContent('show=empty')
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }))
    fireEvent.change(screen.getByLabelText('Search categories'), { target: { value: 'sho' } })
    await waitFor(() => expect(screen.getAllByTestId('admin-category-row')).toHaveLength(1))
  })

  it('create, edit, and the protected delete message', async () => {
    renderAt('/admin-dashboard/categories', <AdminCategoriesPage />)
    await screen.findAllByTestId('admin-category-row')
    fireEvent.click(screen.getByRole('button', { name: 'Add category' }))
    expect(await screen.findByText('Name is required.')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Garden' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add category' }))
    expect(await screen.findByText('Category “Garden” created.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Edit Books' }))
    expect(screen.getByLabelText('Name')).toHaveValue('Books')
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Novels' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(() => expect(updateCategory).toHaveBeenCalledWith(1, { name: 'Novels', description: '' }))
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    deleteCategory.mockRejectedValueOnce({ response: { status: 400, data: { detail: '"Books" still has products. Move or delete them first.' } } })
    fireEvent.click(screen.getByRole('button', { name: 'Delete Books' }))
    expect(await screen.findByText('"Books" still has products. Move or delete them first.')).toBeInTheDocument()
  })
})

describe('AdminOrdersPage', () => {
  beforeEach(() => {
    vi.mocked(getAdminOrders).mockReset().mockResolvedValue({ count: 2, results: [order(41), order(42, { payment_method: 'cod', payment_status: 'due', payment_status_label: 'Pay on delivery', status: 'processing', status_label: 'Processing' })] })
    vi.mocked(updateOrderStatus).mockReset().mockImplementation((id, s) => Promise.resolve(order(id, { status: s, status_label: s.charAt(0).toUpperCase() + s.slice(1) })))
    vi.mocked(getOrder).mockReset().mockResolvedValue({
      ...order(41), subtotal: '1880.00', shipping_cost: '120.00', shipping_method_label: 'Standard delivery',
      items: [{ id: 1, product_id: 27, product_name: 'Yoga Mat 6mm', price: '1880.00', quantity: 1, line_total: '1880.00', image: null }],
      address: { recipient_name: 'Rupa Das', phone: '017', street_address: '12 Lake Road', city: 'Dhaka', postal_code: '1205', country: 'Bangladesh', latitude: null, longitude: null },
    })
    vi.mocked(getAdminPayments).mockReset().mockResolvedValue({ count: 1, results: [{ id: 7, transaction_id: 'cs_test_7', provider_label: 'Stripe', created_at: '2026-11-20T10:00:00Z', amount: '2000.00', status: 'succeeded', status_label: 'Succeeded' }] })
  })

  it('status tabs with counts, filters and sorting', async () => {
    renderAt('/admin-dashboard/orders', <AdminOrdersPage />)
    expect(await screen.findByTestId('tab-count-shipped')).toHaveTextContent('1')
    expect(screen.getByTestId('tab-count-all')).toHaveTextContent('6')
    fireEvent.click(screen.getByRole('tab', { name: /Shipped/ }))
    fireEvent.change(screen.getByLabelText('Payment method'), { target: { value: 'cod' } })
    fireEvent.change(screen.getByLabelText('Sort by'), { target: { value: 'total_high' } })
    await waitFor(() => expect(getAdminOrders).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'shipped', payment_method: 'cod', ordering: 'total_high', page: 1 })))
    fireEvent.change(screen.getByLabelText('Search orders'), { target: { value: '#41' } })
    await waitFor(() => expect(getAdminOrders).toHaveBeenLastCalledWith(expect.objectContaining({ search: '#41' })))
  })

  it('inline status change; COD orders never offer "Paid"', async () => {
    renderAt('/admin-dashboard/orders', <AdminOrdersPage />)
    const table = await screen.findByTestId('orders-table')
    const cod = within(table).getByLabelText('Status for order 42')
    expect(within(cod).queryByRole('option', { name: 'Paid' })).toBeNull()
    fireEvent.change(within(table).getByLabelText('Status for order 41'), { target: { value: 'shipped' } })
    expect(await within(table).findByText('Updated to Shipped')).toBeInTheDocument()
    expect(updateOrderStatus).toHaveBeenCalledWith(41, 'shipped')
  })

  it('order drawer: items, address, payments, status change; ?order= in the URL', async () => {
    renderAt('/admin-dashboard/orders', <AdminOrdersPage />)
    fireEvent.click(within(await screen.findByTestId('orders-table')).getByRole('button', { name: 'View order 41' }))
    const drawer = await screen.findByTestId('order-drawer')
    expect(await within(drawer).findByTestId('drawer-order-items')).toHaveTextContent('Yoga Mat 6mm')
    expect(within(drawer).getByTestId('drawer-order-address')).toHaveTextContent('12 Lake Road')
    expect(await within(drawer).findByTestId('drawer-order-payments')).toHaveTextContent('cs_test_7')
    expect(getAdminPayments).toHaveBeenCalledWith({ order: '41' })
    expect(screen.getByTestId('where')).toHaveTextContent('order=41')
    fireEvent.change(within(drawer).getByLabelText('Status for order 41'), { target: { value: 'processing' } })
    expect(await within(drawer).findByTestId('drawer-status-message')).toHaveTextContent('Updated to Processing')
    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByTestId('order-drawer')).toBeNull())
  })

  it('empty and error states', async () => {
    getAdminOrders.mockRejectedValueOnce({ response: { status: 500, data: { detail: 'Server error.' } } })
    renderAt('/admin-dashboard/orders', <AdminOrdersPage />)
    expect(await screen.findByText('Server error.')).toBeInTheDocument()
    getAdminOrders.mockResolvedValue({ count: 0, results: [] })
    fireEvent.click(screen.getByRole('button', { name: /try again/i }))
    expect(await screen.findByTestId('orders-empty')).toHaveTextContent('No orders yet')
  })
})
