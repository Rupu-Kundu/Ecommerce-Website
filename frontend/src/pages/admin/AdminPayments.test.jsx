import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getAdminPayment, getAdminPayments } from '../../services/adminService'
import AdminPaymentsPage from './AdminPaymentsPage'

vi.mock('../../services/adminService', () => ({ getAdminPayments: vi.fn(), getAdminPayment: vi.fn() }))

const row = (id, over = {}) => ({
  id, transaction_id: `cs_test_${id}`, provider: 'stripe', provider_label: 'Stripe', method: 'card', method_label: 'Card',
  amount: '2000.00', status: 'succeeded', status_label: 'Succeeded', created_at: '2026-11-20T10:00:00Z', updated_at: '2026-11-20T10:05:00Z',
  order: { id: 40 + id, status: 'paid', status_label: 'Paid', payment_status: 'paid', total_amount: '2000.00' },
  customer: { id: 2, username: 'rupa', email: 'rupa@example.com', full_name: 'Rupa Das', is_staff: false },
  ...over,
})
const summary = {
  total: 3, succeeded: { count: 1, amount: '2000.00' }, pending: { count: 1, amount: '950.00' },
  failed: { count: 1, amount: '500.00' }, refunded: { count: 0, amount: '0.00' }, success_rate: 50,
}
const detail = (id) => ({
  ...row(id),
  customer: { id: 2, username: 'rupa', email: 'rupa@example.com', full_name: 'Rupa Das', phone: '017', is_staff: false },
  order_detail: {
    id: 41, status: 'paid', status_label: 'Paid', payment_status: 'paid', payment_status_label: 'Paid', subtotal: '1880.00',
    shipping_cost: '120.00', shipping_method_label: 'Standard delivery', total_amount: '2000.00',
    items: [{ id: 1, product_name: 'Yoga Mat 6mm', quantity: 1, line_total: '1880.00', image: null }],
    address: { recipient_name: 'Rupa Das', phone: '017', street_address: '12 Lake Road', city: 'Dhaka', postal_code: '1205', country: 'Bangladesh' },
  },
  other_attempts: id === 1 ? [row(9, { status: 'failed', status_label: 'Failed', provider_label: 'Demo test gateway' })] : [],
})

function Where() {
  const l = useLocation()
  return <p data-testid="where">{l.search}</p>
}

function renderAt(path = '/admin-dashboard/payments') {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes><Route path="/admin-dashboard/payments" element={<><AdminPaymentsPage /><Where /></>} /></Routes>
    </MemoryRouter>,
  )
}

describe('AdminPaymentsPage', () => {
  beforeEach(() => {
    vi.mocked(getAdminPayments).mockReset().mockResolvedValue({ count: 2, results: [row(1), row(2, { method: 'cod', status: 'pending', status_label: 'Pending' })], summary })
    vi.mocked(getAdminPayment).mockReset().mockImplementation((id) => Promise.resolve(detail(Number(id))))
  })

  it('shows summary cards and the transactions', async () => {
    renderAt()
    expect(await screen.findByTestId('sum-received')).toHaveTextContent('৳2,000')
    expect(screen.getByTestId('sum-rate')).toHaveTextContent('50%')
    const rows = screen.getAllByTestId('payment-row')
    expect(rows).toHaveLength(2)
    expect(rows[0]).toHaveTextContent('cs_test_1')
    expect(rows[0]).toHaveTextContent('#41')
    expect(rows[0]).toHaveTextContent('Rupa Das')
  })

  it('summary cards and filters filter the list (kept in the URL)', async () => {
    renderAt()
    fireEvent.click(await screen.findByTestId('sum-failed'))
    await waitFor(() => expect(getAdminPayments).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'failed', page: 1 })))
    expect(screen.getByTestId('where')).toHaveTextContent('status=failed')
    fireEvent.change(screen.getByLabelText('Method'), { target: { value: 'cod' } })
    fireEvent.change(screen.getByLabelText('Sort by'), { target: { value: 'amount_high' } })
    await waitFor(() => expect(getAdminPayments).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'failed', method: 'cod', ordering: 'amount_high' })))
    fireEvent.change(screen.getByLabelText('Search payments'), { target: { value: 'cs_test' } })
    await waitFor(() => expect(getAdminPayments).toHaveBeenLastCalledWith(expect.objectContaining({ search: 'cs_test' })))
  })

  it('opens the details drawer (URL ?payment=), switches to another attempt, closes with Esc', async () => {
    renderAt()
    fireEvent.click((await screen.findAllByTestId('payment-row'))[0])
    const drawer = await screen.findByTestId('payment-drawer')
    expect(await within(drawer).findByTestId('drawer-amount')).toHaveTextContent('৳2,000')
    expect(within(drawer).getByTestId('drawer-transaction')).toHaveTextContent('cs_test_1')
    expect(within(drawer).getByTestId('drawer-items')).toHaveTextContent('Yoga Mat 6mm')
    expect(within(drawer).getByTestId('drawer-customer')).toHaveAttribute('href', '/admin-dashboard/customers/2')
    expect(screen.getByTestId('where')).toHaveTextContent('payment=1')
    fireEvent.click(within(within(drawer).getByTestId('drawer-attempts')).getByRole('button'))
    await waitFor(() => expect(getAdminPayment).toHaveBeenLastCalledWith('9'))
    expect(await screen.findByTestId('drawer-no-attempts')).toBeInTheDocument()
    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByTestId('payment-drawer')).toBeNull())
    expect(screen.getByTestId('where')).not.toHaveTextContent('payment=')
  })

  it('opening with ?payment= in the URL shows the drawer (survives refresh)', async () => {
    renderAt('/admin-dashboard/payments?payment=2')
    expect(await screen.findByTestId('drawer-amount')).toBeInTheDocument()
    expect(getAdminPayment).toHaveBeenCalledWith('2')
  })

  it('empty and error states', async () => {
    getAdminPayments.mockResolvedValueOnce({ count: 0, results: [], summary: { ...summary, total: 0 } })
    renderAt()
    expect(await screen.findByTestId('payments-empty')).toHaveTextContent('No payments yet')
  })

  it('error with retry', async () => {
    getAdminPayments.mockRejectedValueOnce({ response: { status: 500, data: { detail: 'Server error.' } } })
    renderAt()
    expect(await screen.findByText('Server error.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /try again/i }))
    expect(await screen.findByTestId('sum-received')).toBeInTheDocument()
  })
})
