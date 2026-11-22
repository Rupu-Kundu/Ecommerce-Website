import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { cancelOrder, getOrder } from '../services/orderService'
import OrderDetailPage from './OrderDetailPage'

vi.mock('../services/orderService', () => ({ getOrder: vi.fn(), cancelOrder: vi.fn() }))
vi.mock('../components/map/LazyMaps', () => ({ LazyLocationMap: () => null }))

const base = {
  id: 41, status: 'processing', status_label: 'Processing', payment_status: 'due', payment_status_label: 'Pay on delivery',
  payment_method: 'cod', payment_method_label: 'Cash on delivery', can_cancel: true, created_at: '2026-11-22T10:00:00Z',
  item_count: 1, subtotal: '4950.00', shipping_cost: '120.00', shipping_method_label: 'Standard delivery', total_amount: '5070.00',
  items: [{ id: 1, product_id: 49, product_name: 'Leather Penny Loafers', price: '4950.00', quantity: 1, line_total: '4950.00', image: null }],
  address: null,
}

function renderPage(path = '/orders/41') {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes><Route path="/orders/:id" element={<OrderDetailPage />} /></Routes>
    </MemoryRouter>,
  )
}

describe('OrderDetailPage — cancel a cash-on-delivery order', () => {
  beforeEach(() => {
    vi.mocked(getOrder).mockReset().mockResolvedValue(base)
    vi.mocked(cancelOrder).mockReset().mockResolvedValue({ ...base, status: 'cancelled', status_label: 'Cancelled', payment_status_label: 'Nothing to pay', can_cancel: false })
  })

  it('asks for confirmation, then cancels', async () => {
    renderPage('/orders/41?placed=cod')
    expect(await screen.findByTestId('cod-placed')).toHaveTextContent('You can cancel until the order ships')
    fireEvent.click(screen.getByRole('button', { name: 'Cancel order' }))
    expect(screen.getByRole('alertdialog')).toHaveTextContent('Cancel order #41?')
    fireEvent.click(screen.getByRole('button', { name: 'Keep my order' }))
    expect(cancelOrder).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel order' }))
    fireEvent.click(screen.getByRole('button', { name: 'Yes, cancel order' }))
    expect(await screen.findByTestId('order-cancelled')).toHaveTextContent('Nothing to pay')
    expect(cancelOrder).toHaveBeenCalledWith(41)
    expect(screen.queryByTestId('cancel-order')).toBeNull()
    expect(screen.queryByTestId('cod-placed')).toBeNull()
    expect(screen.getByTestId('payment-status')).toHaveTextContent('Nothing to pay')
  })

  it('shows the server message if it already shipped', async () => {
    vi.mocked(cancelOrder).mockRejectedValue({ response: { status: 400, data: { detail: 'Order #41 has already been shipped, so it can\'t be cancelled. Please contact support.' } } })
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel order' }))
    getOrder.mockResolvedValue({ ...base, status: 'shipped', status_label: 'Shipped', can_cancel: false })
    fireEvent.click(screen.getByRole('button', { name: 'Yes, cancel order' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('already been shipped')
    await waitFor(() => expect(screen.queryByTestId('cancel-order')).toBeNull()) // refreshed: no button any more
  })

  it('no cancel button for paid online orders', async () => {
    getOrder.mockResolvedValue({ ...base, payment_method: 'card', payment_status: 'paid', can_cancel: false })
    renderPage()
    await screen.findByRole('heading', { name: 'Order #41' })
    expect(screen.queryByRole('button', { name: 'Cancel order' })).toBeNull()
  })
})
