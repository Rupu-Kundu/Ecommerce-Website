import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getAdminCustomer, getAdminCustomers, getAdminOrders } from '../../services/adminService'
import AdminCustomerDetailPage from './AdminCustomerDetailPage'
import AdminCustomersPage from './AdminCustomersPage'

vi.mock('../../services/adminService', () => ({ getAdminCustomers: vi.fn(), getAdminCustomer: vi.fn(), getAdminOrders: vi.fn() }))

const rupa = {
  id: 2, username: 'rupa', email: 'rupa@example.com', full_name: 'Rupa Das', phone: '01712345678', is_active: true,
  date_joined: '2026-11-01T10:00:00Z', last_login: '2026-11-22T10:00:00Z', orders_count: 4, total_spent: '5000.00', last_order_at: '2026-11-20T10:00:00Z',
}
const kabir = { ...rupa, id: 3, username: 'kabir', email: 'kabir@example.com', full_name: '', phone: '', is_active: false, orders_count: 0, total_spent: '0.00', last_order_at: null }
const summary = { total: 2, active: 1, with_orders: 1, new_last_30_days: 2 }

function Where() {
  const l = useLocation()
  return <p data-testid="where">{l.pathname + l.search}</p>
}

function renderAt(path) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/admin-dashboard/customers" element={<AdminCustomersPage />} />
        <Route path="/admin-dashboard/customers/:id" element={<AdminCustomerDetailPage />} />
      </Routes>
      <Where />
    </MemoryRouter>,
  )
}

describe('AdminCustomersPage', () => {
  beforeEach(() => {
    vi.mocked(getAdminCustomers).mockReset().mockResolvedValue({ count: 2, next: null, previous: null, results: [rupa, kabir], summary })
  })
  afterEach(() => vi.useRealTimers())

  it('lists customers with summary, stats and status', async () => {
    renderAt('/admin-dashboard/customers')
    expect(await screen.findByTestId('sum-total')).toHaveTextContent('2')
    const rows = screen.getAllByTestId('customer-row')
    expect(rows[0]).toHaveTextContent('Rupa Das')
    expect(rows[0]).toHaveTextContent('৳5,000')
    expect(rows[0]).toHaveTextContent('Active')
    expect(rows[1]).toHaveTextContent('kabir')
    expect(rows[1]).toHaveTextContent('Never')
    expect(rows[1]).toHaveTextContent('Inactive')
    expect(screen.getByTestId('customer-count')).toHaveTextContent('(2 total)')
  })

  it('filters and debounced search go to the API and the URL; page resets', async () => {
    renderAt('/admin-dashboard/customers?page=2')
    await screen.findByTestId('sum-total')
    expect(getAdminCustomers).toHaveBeenLastCalledWith({ search: '', status: '', orders: '', joined: '', ordering: '', page: 2 })
    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'inactive' } })
    await waitFor(() => expect(getAdminCustomers).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'inactive', page: 1 })))
    expect(screen.getByTestId('where')).toHaveTextContent('?status=inactive')
    fireEvent.change(screen.getByLabelText('Sort by'), { target: { value: 'spent' } })
    await waitFor(() => expect(getAdminCustomers).toHaveBeenLastCalledWith(expect.objectContaining({ ordering: 'spent' })))
    const calls = getAdminCustomers.mock.calls.length
    fireEvent.change(screen.getByLabelText('Search customers'), { target: { value: 'ru' } })
    fireEvent.change(screen.getByLabelText('Search customers'), { target: { value: 'rupa' } })
    await waitFor(() => expect(getAdminCustomers).toHaveBeenLastCalledWith(expect.objectContaining({ search: 'rupa' })))
    expect(getAdminCustomers.mock.calls.length).toBe(calls + 1) // one request for the whole typed word
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }))
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent(/^\/admin-dashboard\/customers(\?ordering=spent)?$/))
    expect(screen.getByLabelText('Search customers')).toHaveValue('')
  })

  it('two quick filter changes both stick (no lost update)', async () => {
    renderAt('/admin-dashboard/customers')
    await screen.findByTestId('sum-total')
    fireEvent.change(screen.getByLabelText('Orders'), { target: { value: 'with' } })
    fireEvent.change(screen.getByLabelText('Sort by'), { target: { value: 'name' } })
    fireEvent.change(screen.getByLabelText('Orders'), { target: { value: '' } })
    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'active' } })
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('?ordering=name&status=active'))
    await waitFor(() => expect(getAdminCustomers).toHaveBeenLastCalledWith(expect.objectContaining({ orders: '', ordering: 'name', status: 'active' })))
  })

  it('shows empty states (no customers vs no matches)', async () => {
    getAdminCustomers.mockResolvedValue({ count: 0, next: null, previous: null, results: [], summary: { ...summary, total: 0 } })
    renderAt('/admin-dashboard/customers')
    expect(await screen.findByTestId('customers-empty')).toHaveTextContent('No customers yet')
    fireEvent.change(screen.getByLabelText('Orders'), { target: { value: 'without' } })
    await waitFor(() => expect(screen.getByTestId('customers-empty')).toHaveTextContent('No customers match these filters'))
  })

  it('shows an error with retry', async () => {
    getAdminCustomers.mockRejectedValueOnce({ response: { status: 500, data: { detail: 'Server error.' } } })
    renderAt('/admin-dashboard/customers')
    expect(await screen.findByText('Server error.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /try again/i }))
    expect(await screen.findByTestId('sum-total')).toBeInTheDocument()
  })

  it('a row opens the customer details', async () => {
    vi.mocked(getAdminCustomer).mockReturnValue(new Promise(() => {})) // details keep loading
    vi.mocked(getAdminOrders).mockReturnValue(new Promise(() => {}))
    renderAt('/admin-dashboard/customers')
    fireEvent.click((await screen.findAllByTestId('customer-row'))[0])
    expect(screen.getByTestId('where')).toHaveTextContent('/admin-dashboard/customers/2')
  })
})

describe('AdminCustomerDetailPage', () => {
  beforeEach(() => {
    vi.mocked(getAdminCustomer).mockReset().mockResolvedValue({
      ...rupa, first_name: 'Rupa', last_name: 'Das', reviews_count: 1, chats_count: 0,
      stats: { orders_count: 4, paid_orders: 2, total_spent: '5000.00', average_order_value: '2500.00', first_order_at: '2026-11-02T10:00:00Z', last_order_at: '2026-11-20T10:00:00Z', cancelled_orders: 1, open_orders: 2, cod_due: '1500.00' },
      addresses: [{ id: 1, recipient_name: 'Rupa Das', phone: '+8801712345678', street_address: '12 Lake Road', city: 'Dhaka', postal_code: '1205', country: 'Bangladesh', latitude: null }],
    })
    vi.mocked(getAdminOrders).mockReset().mockResolvedValue({
      count: 13, next: 'x', previous: null,
      results: [{ id: 41, item_count: 1, created_at: '2026-11-20T10:00:00Z', payment_method: 'cod', payment_status: 'due', payment_status_label: 'Pay on delivery', status: 'processing', status_label: 'Processing', total_amount: '1500.00' }],
    })
  })

  it('shows profile, stats, addresses and paginated orders', async () => {
    renderAt('/admin-dashboard/customers/2')
    expect(await screen.findByTestId('customer-name')).toHaveTextContent('Rupa Das')
    expect(screen.getByTestId('cust-spent')).toHaveTextContent('৳5,000')
    expect(screen.getByText(/৳1,500 cash due/)).toBeInTheDocument()
    expect(screen.getByTestId('addresses')).toHaveTextContent('12 Lake Road')
    expect(await screen.findByTestId('history-table')).toHaveTextContent('#41')
    expect(getAdminOrders).toHaveBeenLastCalledWith({ customer: 2, page: 1 })
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    await waitFor(() => expect(getAdminOrders).toHaveBeenLastCalledWith({ customer: 2, page: 2 }))
  })

  it('no orders → empty history; unknown id → not found', async () => {
    getAdminOrders.mockResolvedValue({ count: 0, next: null, previous: null, results: [] })
    renderAt('/admin-dashboard/customers/2')
    expect(await screen.findByTestId('history-empty')).toBeInTheDocument()
  })

  it('404 shows "Customer not found" with a way back', async () => {
    getAdminCustomer.mockRejectedValue({ response: { status: 404, data: { detail: 'Not found.' } } })
    renderAt('/admin-dashboard/customers/999')
    expect(await screen.findByTestId('customer-not-found')).toHaveTextContent('Customer not found')
    await act(async () => fireEvent.click(screen.getByRole('link', { name: '← All customers' })))
    expect(screen.getByTestId('where')).toHaveTextContent('/admin-dashboard/customers')
  })
})
