import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import BarList from '../../components/admin/BarList'
import { DeltaBadge } from '../../components/admin/StatTile'
import TrendChart from '../../components/admin/TrendChart'
import { getAdminStats } from '../../services/adminService'
import AdminOverviewPage from './AdminOverviewPage'

vi.mock('../../services/adminService', () => ({ getAdminStats: vi.fn() }))

function day(i, revenue = '0.00', orders = 0) {
  const d = new Date(2026, 10, 16 + i)
  return { date: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`, revenue, orders }
}

function stats(days = 7, overrides = {}) {
  return {
    total_sales: '15000.00', sales_count: 4, order_count: 6, open_orders: 2,
    product_count: 65, low_stock_count: 2, out_of_stock_count: 1, low_stock_threshold: 5, customer_count: 12,
    recent_orders: [{
      id: 9, customer: { username: 'rupa' }, item_count: 2, created_at: '2026-11-22T10:00:00Z', payment_method: 'bkash',
      payment_status: 'paid', payment_status_label: 'Paid', status: 'paid', status_label: 'Paid', total_amount: '4000.00',
    }],
    period: { days, start: '2026-11-16', end: '2026-11-22', previous_start: '2026-11-09', previous_end: '2026-11-15' },
    kpis: {
      revenue: { value: '4000.00', previous: '2000.00', change_pct: 100 },
      orders: { value: 3, previous: 4, change_pct: -25 },
      average_order_value: { value: '2000.00', previous: '2000.00', change_pct: 0 },
      paid_orders: { value: 2, previous: 1, change_pct: 100 },
      new_customers: { value: 3, previous: 0, change_pct: null },
      new_products: { value: 0, previous: 0, change_pct: null },
    },
    daily: Array.from({ length: 7 }, (_, i) => day(i, i === 6 ? '4000.00' : '0.00', i === 6 ? 3 : 0)),
    status_breakdown: { paid: 1, processing: 1, shipped: 0, delivered: 1, cancelled: 0 },
    payment_methods: [
      { method: 'card', label: 'Card', orders: 1, revenue: '1000.00' },
      { method: 'bkash', label: 'bKash', orders: 1, revenue: '3000.00' },
      { method: 'nagad', label: 'Nagad', orders: 0, revenue: '0.00' },
      { method: 'cod', label: 'Cash on delivery', orders: 1, revenue: '0.00' },
    ],
    top_products: [{ product_id: 3, name: 'Smart Watch Fit 2', quantity: 1, revenue: '3000.00', image: null }],
    ...overrides,
  }
}

function Where() {
  return <p data-testid="where">{useLocation().search}</p>
}

function renderPage(path = '/admin-dashboard') {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes><Route path="/admin-dashboard" element={<><AdminOverviewPage /><Where /></>} /></Routes>
    </MemoryRouter>,
  )
}

describe('DeltaBadge', () => {
  it('shows direction with an arrow and sign, not colour alone', () => {
    const { rerender } = render(<DeltaBadge change={12.5} current={5} previousLabel="previous 7 days" />)
    expect(screen.getByTestId('delta')).toHaveTextContent('▲+12.5%vs previous 7 days')
    rerender(<DeltaBadge change={-25} current={3} previousLabel="previous 7 days" />)
    expect(screen.getByTestId('delta')).toHaveTextContent('▼-25%')
    rerender(<DeltaBadge change={null} current={3} previousLabel="x" />)
    expect(screen.getByTestId('delta')).toHaveTextContent('New')
    rerender(<DeltaBadge change={null} current={0} previousLabel="x" />)
    expect(screen.getByTestId('delta')).toHaveTextContent('No change')
  })
})

describe('BarList', () => {
  it('prints every value and handles empty data', () => {
    const { rerender } = render(<BarList rows={[{ key: 'a', label: 'Paid', value: 3, display: '3' }, { key: 'b', label: 'Shipped', value: 0, display: '0' }]} testId="bars" />)
    expect(screen.getByTestId('bars')).toHaveTextContent('Paid3')
    expect(screen.getByTestId('bars')).toHaveTextContent('Shipped0')
    rerender(<BarList rows={[{ key: 'a', label: 'Paid', value: 0, display: '0' }]} emptyText="Nothing yet" testId="bars" />)
    expect(screen.getByTestId('bars')).toHaveTextContent('Nothing yet')
  })
})

describe('TrendChart', () => {
  const points = [{ date: '2026-11-20', value: 0 }, { date: '2026-11-21', value: 1500 }, { date: '2026-11-22', value: 4000 }]
  const props = { label: 'Revenue', formatValue: (v) => `৳${v}`, formatAxis: String, formatDate: (d) => d.slice(5), emptyText: 'Nothing' }

  it('keyboard users can read each day in the tooltip', () => {
    render(<TrendChart points={points} {...props} />)
    const chart = screen.getByRole('img', { name: /Revenue: 3 days, total ৳5500/ })
    fireEvent.focus(chart)
    expect(screen.getByTestId('chart-tooltip')).toHaveTextContent('৳4000')
    fireEvent.keyDown(chart, { key: 'ArrowLeft' })
    expect(screen.getByTestId('chart-tooltip')).toHaveTextContent('৳1500')
    fireEvent.keyDown(chart, { key: 'Home' })
    expect(screen.getByTestId('chart-tooltip')).toHaveTextContent('11-20')
    fireEvent.blur(chart)
    expect(screen.queryByTestId('chart-tooltip')).toBeNull()
  })

  it('shows a message when everything is zero', () => {
    render(<TrendChart points={points.map((p) => ({ ...p, value: 0 }))} {...props} />)
    expect(screen.getByText('Nothing')).toBeInTheDocument()
  })
})

describe('AdminOverviewPage', () => {
  beforeEach(() => {
    vi.mocked(getAdminStats).mockReset().mockImplementation((d) => Promise.resolve(stats(d)))
  })

  it('shows KPIs with changes, breakdowns, top products and recent orders', async () => {
    renderPage()
    expect(await screen.findByTestId('kpi-revenue')).toHaveTextContent('৳4,000')
    expect(getAdminStats).toHaveBeenCalledWith(30)
    const revenueTile = screen.getByTestId('kpi-revenue').closest('div')
    expect(within(revenueTile).getByTestId('delta')).toHaveTextContent('+100%')
    expect(screen.getByTestId('kpi-orders')).toHaveTextContent('3')
    expect(screen.getByTestId('kpi-products')).toHaveTextContent('65')
    expect(screen.getByTestId('kpi-customers')).toHaveTextContent('12')
    expect(screen.getByTestId('status-bars')).toHaveTextContent('Delivered1')
    expect(screen.getByTestId('method-bars')).toHaveTextContent('bKash1৳3,000')
    expect(screen.getByTestId('top-products')).toHaveTextContent('Smart Watch Fit 2')
    expect(screen.getByTestId('recent-orders-table')).toHaveTextContent('rupa')
    expect(screen.getByTestId('stat-sales')).toHaveTextContent('৳15,000')
  })

  it('switches the period (kept in the URL) and the chart metric, with a table view', async () => {
    renderPage()
    await screen.findByTestId('kpi-revenue')
    fireEvent.click(screen.getByRole('button', { name: '7 days' }))
    await waitFor(() => expect(getAdminStats).toHaveBeenLastCalledWith(7))
    expect(screen.getByTestId('where')).toHaveTextContent('?days=7')
    expect(screen.getByRole('button', { name: '7 days' })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(screen.getByRole('button', { name: 'Orders' }))
    expect(screen.getByRole('heading', { name: 'Orders per day' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'View as table' }))
    expect(within(screen.getByTestId('trend-table')).getAllByRole('row')).toHaveLength(1 + 7) // header + one row per day
  })

  it('handles an empty store', async () => {
    getAdminStats.mockImplementation((d) => Promise.resolve(stats(d, {
      recent_orders: [], top_products: [],
      daily: Array.from({ length: 7 }, (_, i) => day(i)),
      status_breakdown: { paid: 0, processing: 0, shipped: 0, delivered: 0, cancelled: 0 },
      payment_methods: [{ method: 'card', label: 'Card', orders: 0, revenue: '0.00' }],
    })))
    renderPage()
    expect(await screen.findByText('No payments received in this period yet.')).toBeInTheDocument()
    expect(screen.getByTestId('top-products-empty')).toBeInTheDocument()
    expect(screen.getByText(/No orders yet/)).toBeInTheDocument()
    expect(screen.getAllByText('No orders placed in this period.')).toHaveLength(2)
  })

  it('shows an error with retry', async () => {
    getAdminStats.mockRejectedValueOnce({ response: { status: 500, data: { detail: 'Server error.' } } })
    renderPage()
    expect(await screen.findByText('Server error.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /try again/i }))
    expect(await screen.findByTestId('kpi-revenue')).toBeInTheDocument()
  })
})
