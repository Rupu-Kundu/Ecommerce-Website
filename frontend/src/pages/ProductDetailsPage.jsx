import { useCallback, useEffect, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import ErrorMessage from '../components/ErrorMessage'
import Loader from '../components/Loader'
import ProductGallery from '../components/product/ProductGallery'
import ProductReviews from '../components/product/ProductReviews'
import StarRating from '../components/product/StarRating'
import QuantityControl from '../components/QuantityControl'
import useAuth from '../context/useAuth'
import useCart from '../context/useCart'
import { getErrorMessage } from '../services/api'
import { getProduct } from '../services/productService'
import { formatPrice } from '../utils/format'
import NotFoundPage from './NotFoundPage'

export default function ProductDetailsPage() {
  const { id } = useParams()
  const [product, setProduct] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notFound, setNotFound] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)

  const { isAuthenticated } = useAuth()
  const { cart, addToCart } = useCart()
  const navigate = useNavigate()
  const location = useLocation()
  const [quantity, setQuantity] = useState(1)
  const [adding, setAdding] = useState(false)
  const [cartMessage, setCartMessage] = useState(null) // { type: 'success' | 'error', text }
  const [ratingSummary, setRatingSummary] = useState(null) // kept in sync with the reviews section
  const onSummaryChange = useCallback((s) => setRatingSummary(s), [])

  async function handleAddToCart() {
    // Cart needs an account: send guests to login, then bring them back here.
    if (!isAuthenticated) {
      navigate('/login', { state: { from: location } })
      return
    }
    setAdding(true)
    setCartMessage(null)
    try {
      await addToCart(product.id, quantity)
      setCartMessage({ type: 'success', text: `Added ${quantity} × ${product.name} to your cart.` })
      setQuantity(1)
    } catch (err) {
      setCartMessage({ type: 'error', text: getErrorMessage(err, 'Could not add to cart.') })
    } finally {
      setAdding(false)
    }
  }

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError('')
      setNotFound(false)
      try {
        const data = await getProduct(id)
        if (!cancelled) setProduct(data)
      } catch (err) {
        if (cancelled) return
        if (err.response?.status === 404) setNotFound(true)
        else setError(getErrorMessage(err, 'Could not load this product.'))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [id, reloadKey])

  if (loading) return <Loader label="Loading product..." />
  if (notFound) return <NotFoundPage message="This product doesn't exist or is no longer available." />
  if (error) return <ErrorMessage message={error} onRetry={() => setReloadKey((k) => k + 1)} />

  const inStock = product.stock_quantity > 0
  const inCart = cart.items.find((item) => item.product.id === product.id)?.quantity || 0
  const canAddMore = Math.max(product.stock_quantity - inCart, 0)

  return (
    <div>
      <nav className="mb-6 text-sm text-slate-500" aria-label="Breadcrumb">
        <Link to="/products" className="hover:text-brand-700">Products</Link>
        <span className="mx-2">/</span>
        <Link to={`/products?category=${product.category_slug}`} className="hover:text-brand-700">
          {product.category_name}
        </Link>
      </nav>

      <div className="grid gap-8 rounded-2xl border border-slate-200 bg-white p-4 sm:p-6 md:grid-cols-2">
        <ProductGallery product={product} />

        <div className="flex min-w-0 flex-col">
          <span className="text-sm font-medium uppercase tracking-wide text-slate-500">
            {product.brand ? <><span className="text-brand-700" data-testid="product-brand">{product.brand}</span> · </> : null}
            {product.category_name}
          </span>
          <h1 className="mt-1 text-2xl font-bold text-slate-900 sm:text-3xl">{product.name}</h1>
          <a href="#reviews" className="mt-2 inline-flex w-fit items-center gap-2 text-sm text-slate-600 hover:text-brand-700" data-testid="product-rating">
            <StarRating value={(ratingSummary ?? { average: product.average_rating }).average} />
            {(ratingSummary?.count ?? product.rating_count) > 0
              ? `${(ratingSummary?.average ?? product.average_rating).toFixed(1)} · ${ratingSummary?.count ?? product.rating_count} ratings`
              : 'No ratings yet — be the first'}
          </a>
          <p className="mt-4 text-3xl font-bold text-brand-700">{formatPrice(product.price)}</p>

          <p className={`mt-3 text-sm font-medium ${inStock ? 'text-emerald-600' : 'text-red-600'}`}>
            {inStock ? `In stock (${product.stock_quantity} available)` : 'Out of stock'}
          </p>

          {product.description && <p className="mt-4 whitespace-pre-line text-slate-600">{product.description}</p>}

          <ul className="mt-4 space-y-1.5 text-sm text-slate-600">
            <li>🚚 Delivery all over Bangladesh — ৳120, free from ৳5,000</li>
            <li>💵 Cash on delivery available, or pay with Card, bKash or Nagad</li>
            <li>↩️ 7-day easy return on unused items</li>
          </ul>

          {inStock && (
            <div className="mt-6 border-t border-slate-100 pt-6">
              {inCart > 0 && (
                <p className="mb-3 text-sm text-slate-600">
                  You have {inCart} in your cart.{' '}
                  <Link to="/cart" className="font-medium text-brand-700 hover:underline">View cart</Link>
                </p>
              )}
              {canAddMore > 0 || !isAuthenticated ? (
                <div className="flex flex-wrap items-center gap-3">
                  <QuantityControl
                    value={quantity}
                    max={isAuthenticated ? canAddMore : product.stock_quantity}
                    onChange={setQuantity}
                    disabled={adding}
                  />
                  <button
                    type="button"
                    onClick={handleAddToCart}
                    disabled={adding}
                    className="rounded-md bg-brand-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
                  >
                    {adding ? 'Adding...' : 'Add to cart'}
                  </button>
                  <button
                    type="button"
                    onClick={() => navigate(`/checkout?buy=${product.id}&qty=${quantity}`)}
                    disabled={adding}
                    className="rounded-md border-2 border-brand-700 px-6 py-2 text-sm font-semibold text-brand-700 hover:bg-brand-50 disabled:opacity-60"
                  >
                    Buy now
                  </button>
                </div>
              ) : (
                <p className="text-sm text-amber-700">You already have all available stock in your cart.</p>
              )}
              {!isAuthenticated && (
                <p className="mt-2 text-xs text-slate-500">You&apos;ll be asked to log in first.</p>
              )}
              {cartMessage && (
                <p
                  role={cartMessage.type === 'error' ? 'alert' : 'status'}
                  className={`mt-3 text-sm ${cartMessage.type === 'error' ? 'text-red-600' : 'text-emerald-700'}`}
                >
                  {cartMessage.text}
                  {cartMessage.type === 'success' && (
                    <>
                      {' '}
                      <Link to="/cart" className="font-medium underline">View cart</Link>
                    </>
                  )}
                </p>
              )}
            </div>
          )}

          <Link
            to="/products"
            className="mt-8 inline-block self-start rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            ← Back to products
          </Link>
        </div>
      </div>

      {/* Product details */}
      <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-4 sm:p-6" aria-labelledby="details-heading">
        <h2 id="details-heading" className="text-xl font-bold text-slate-900">Product details</h2>
        <div className="mt-4 grid gap-6 md:grid-cols-2">
          <div className="text-sm leading-relaxed text-slate-600">
            {product.description && <p className="whitespace-pre-line">{product.description}</p>}
            <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
              {product.brand && (<><dt className="font-medium text-slate-500">Brand</dt><dd className="text-slate-900">{product.brand}</dd></>)}
              <dt className="font-medium text-slate-500">Category</dt>
              <dd><Link to={`/products?category=${product.category_slug}`} className="text-brand-700 hover:underline">{product.category_name}</Link></dd>
              <dt className="font-medium text-slate-500">Product code</dt><dd className="text-slate-900">HB-{String(product.id).padStart(5, '0')}</dd>
              <dt className="font-medium text-slate-500">Availability</dt>
              <dd className={inStock ? 'text-emerald-700' : 'text-red-600'}>{inStock ? `In stock (${product.stock_quantity})` : 'Out of stock'}</dd>
            </dl>
          </div>
          {product.specifications?.length > 0 && (
            <table className="w-full overflow-hidden rounded-xl text-sm ring-1 ring-slate-200" data-testid="specifications">
              <caption className="sr-only">Specifications</caption>
              <tbody>
                {product.specifications.map((row, i) => (
                  <tr key={row.label} className={i % 2 ? 'bg-white' : 'bg-slate-50'}>
                    <th scope="row" className="w-2/5 px-4 py-2.5 text-left font-medium text-slate-500">{row.label}</th>
                    <td className="px-4 py-2.5 text-slate-900">{row.value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      {/* Ratings & reviews */}
      <section id="reviews" className="mt-6 scroll-mt-24 rounded-2xl border border-slate-200 bg-white p-4 sm:p-6" aria-labelledby="reviews-heading">
        <h2 id="reviews-heading" className="mb-4 text-xl font-bold text-slate-900">Ratings &amp; reviews</h2>
        <ProductReviews productId={product.id} onSummaryChange={onSummaryChange} />
      </section>
    </div>
  )
}
