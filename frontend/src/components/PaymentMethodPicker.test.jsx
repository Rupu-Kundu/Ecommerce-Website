import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import PaymentMethodPicker from './PaymentMethodPicker'
import ProductCard from './ProductCard'

const METHODS = [
  { code: 'card', label: 'Card', available: true, demo: false },
  { code: 'bkash', label: 'bKash', available: true, demo: true },
  { code: 'nagad', label: 'Nagad', available: false, demo: false },
]

describe('PaymentMethodPicker', () => {
  it('shows Card, bKash and Nagad with test-mode and unavailable states', () => {
    const onChange = vi.fn()
    render(<PaymentMethodPicker methods={METHODS} value="card" onChange={onChange} />)
    expect(screen.getByLabelText('Pay with Card')).toBeChecked()
    expect(screen.getByLabelText('Pay with Nagad')).toBeDisabled()
    expect(screen.getByText('Not available right now')).toBeInTheDocument()
    expect(screen.getAllByText('Test mode')).toHaveLength(1) // only bKash is in demo mode
    fireEvent.click(screen.getByLabelText('Pay with bKash'))
    expect(onChange).toHaveBeenCalledWith('bkash')
  })
})

function ShowLocation() {
  const location = useLocation()
  return <p>At {location.pathname + location.search}</p>
}

describe('ProductCard "Buy now"', () => {
  const product = { id: 9, name: 'Yoga Mat', price: '1850.00', stock_quantity: 4, category_name: 'Sports', image: null }

  it('goes straight to checkout for just this product', () => {
    render(
      <MemoryRouter initialEntries={['/products']}>
        <Routes>
          <Route path="/products" element={<ProductCard product={product} />} />
          <Route path="/checkout" element={<ShowLocation />} />
        </Routes>
      </MemoryRouter>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Buy Yoga Mat now' }))
    expect(screen.getByText('At /checkout?buy=9&qty=1')).toBeInTheDocument()
  })

  it('is disabled when out of stock', () => {
    render(<MemoryRouter><ProductCard product={{ ...product, stock_quantity: 0 }} /></MemoryRouter>)
    expect(screen.getByRole('button', { name: 'Buy Yoga Mat now' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Buy Yoga Mat now' })).toHaveTextContent('Sold out')
  })
})
