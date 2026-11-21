import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import OrderSummary from './OrderSummary'
import ProductCard from './ProductCard'

const product = {
  id: 7, name: 'Smart Watch Fit 2', price: '6499.00', stock_quantity: 3,
  category_name: 'Electronics', image: 'http://localhost:8000/media/products/watch.jpg',
}

describe('ProductCard', () => {
  it('shows name, category, BDT price, stock and links to details', () => {
    render(<MemoryRouter><ProductCard product={product} /></MemoryRouter>)
    expect(screen.getByText('Smart Watch Fit 2')).toBeInTheDocument()
    expect(screen.getByText('Electronics')).toBeInTheDocument()
    expect(screen.getByText('৳6,499')).toBeInTheDocument()
    expect(screen.getByText('In stock')).toBeInTheDocument()
    expect(screen.getByRole('link')).toHaveAttribute('href', '/products/7')
    expect(screen.getByRole('img', { name: 'Smart Watch Fit 2' })).toHaveAttribute('src', product.image)
  })
  it('shows out of stock and a placeholder without image', () => {
    render(<MemoryRouter><ProductCard product={{ ...product, stock_quantity: 0, image: null }} /></MemoryRouter>)
    expect(screen.getByText('Out of stock')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: /no image/ })).toHaveTextContent('S')
  })
})

describe('OrderSummary', () => {
  it('adds shipping to the subtotal', () => {
    render(<OrderSummary itemCount={3} subtotal="14848.00" shipping={300} />)
    expect(screen.getByTestId('subtotal')).toHaveTextContent('৳14,848')
    expect(screen.getByTestId('shipping')).toHaveTextContent('৳300')
    expect(screen.getByTestId('total')).toHaveTextContent('৳15,148')
  })
  it('shows Free shipping', () => {
    render(<OrderSummary itemCount={1} subtotal="6000.00" shipping={0} />)
    expect(screen.getByTestId('shipping')).toHaveTextContent('Free')
    expect(screen.getByTestId('total')).toHaveTextContent('৳6,000')
  })
})
