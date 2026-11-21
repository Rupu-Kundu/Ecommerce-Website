import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthContext } from '../../context/authContext'
import { getReviews, saveReview } from '../../services/productService'
import PaymentMethodPicker from '../PaymentMethodPicker'
import ProductGallery from './ProductGallery'
import ProductReviews from './ProductReviews'
import StarRating from './StarRating'

vi.mock('../../services/productService', () => ({ getReviews: vi.fn(), saveReview: vi.fn(), deleteReview: vi.fn() }))

const product = {
  id: 7, name: 'Leather Loafers', image: '/media/a.jpg',
  images: [{ id: 1, image: '/media/b.jpg', alt_text: 'Leather Loafers — another view' }],
}

describe('StarRating', () => {
  it('describes the rating for screen readers', () => {
    render(<StarRating value={4.3} count={12} />)
    expect(screen.getByRole('img', { name: 'Rated 4.3 out of 5 from 12 ratings' })).toBeInTheDocument()
  })
  it('says when there are no ratings', () => {
    render(<StarRating value={null} count={0} />)
    expect(screen.getByRole('img', { name: 'No ratings yet' })).toBeInTheDocument()
  })
})

describe('ProductGallery', () => {
  it('switches photos with thumbnails and zooms in the full-screen viewer', () => {
    render(<ProductGallery product={product} />)
    expect(screen.getByTestId('gallery-main')).toHaveAttribute('src', '/media/a.jpg')
    expect(screen.getAllByTestId('gallery-thumb')).toHaveLength(2)
    fireEvent.click(screen.getByRole('button', { name: 'Show photo 2 of 2' }))
    expect(screen.getByTestId('gallery-main')).toHaveAttribute('src', '/media/b.jpg')

    fireEvent.click(screen.getByRole('button', { name: /Zoom in on/ }))
    const viewer = screen.getByTestId('lightbox')
    expect(viewer).toHaveTextContent('2 / 2')
    expect(screen.getByTestId('zoom-level')).toHaveTextContent('1×')
    fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }))
    fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }))
    expect(screen.getByTestId('zoom-level')).toHaveTextContent('3×')
    fireEvent.keyDown(document, { key: 'ArrowRight' })
    expect(viewer).toHaveTextContent('1 / 2')
    expect(screen.getByTestId('zoom-level')).toHaveTextContent('1×') // zoom resets on a new photo
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByTestId('lightbox')).toBeNull()
  })
})

function renderReviews(user = null) {
  return render(
    <AuthContext.Provider value={{ user, isAuthenticated: Boolean(user) }}>
      <MemoryRouter>
        <ProductReviews productId={7} />
      </MemoryRouter>
    </AuthContext.Provider>,
  )
}

describe('ProductReviews', () => {
  beforeEach(() => {
    vi.mocked(getReviews).mockReset().mockResolvedValue({
      summary: { average: 4.5, count: 2, distribution: { 5: 1, 4: 1, 3: 0, 2: 0, 1: 0 } },
      my_review: null,
      results: [
        { id: 1, rating: 5, comment: 'Great fit!', author: 'rupa', verified_purchase: true, is_mine: false, created_at: '2026-11-20T10:00:00Z' },
        { id: 2, rating: 4, comment: '', author: 'bob', verified_purchase: false, is_mine: false, created_at: '2026-11-21T10:00:00Z' },
      ],
    })
    vi.mocked(saveReview).mockReset().mockResolvedValue({})
  })

  it('shows the summary and reviews; guests are asked to log in', async () => {
    renderReviews()
    expect(await screen.findByTestId('average-rating')).toHaveTextContent('4.5')
    expect(screen.getAllByTestId('review')).toHaveLength(2)
    expect(screen.getByText('✓ Verified purchase')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Log in' })).toBeInTheDocument()
  })

  it('a customer rates with stars and a comment', async () => {
    renderReviews({ id: 3, username: 'mina' })
    fireEvent.click(await screen.findByRole('button', { name: 'Write a review' }))
    fireEvent.click(screen.getByRole('button', { name: 'Submit review' }))
    expect(screen.getByRole('alert')).toHaveTextContent('choose 1 to 5 stars')
    fireEvent.click(screen.getByLabelText('4 stars – Very good'))
    fireEvent.change(screen.getByPlaceholderText(/What did you like/), { target: { value: ' Comfy ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Submit review' }))
    await waitFor(() => expect(saveReview).toHaveBeenCalledWith(7, { rating: 4, comment: 'Comfy' }))
    await waitFor(() => expect(getReviews).toHaveBeenCalledTimes(2)) // reloaded
  })
})

describe('PaymentMethodPicker cash on delivery', () => {
  it('offers COD with its own description and no test-mode badge', () => {
    const onChange = vi.fn()
    render(<PaymentMethodPicker methods={[{ code: 'card', label: 'Card', available: true, demo: true }, { code: 'cod', label: 'Cash on delivery', available: true, demo: false }]} value="card" onChange={onChange} />)
    expect(screen.getByText(/pay the rider when your order arrives/)).toBeInTheDocument()
    expect(screen.getAllByText('Test mode')).toHaveLength(1)
    fireEvent.click(screen.getByLabelText('Pay with Cash on delivery'))
    expect(onChange).toHaveBeenCalledWith('cod')
  })
})
