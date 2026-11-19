import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import ErrorMessage from '../components/ErrorMessage'
import Loader from '../components/Loader'
import ProductImage from '../components/ProductImage'
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
        <div className="aspect-square overflow-hidden rounded-xl">
          <ProductImage product={product} />
        </div>

        <div className="flex flex-col">
          <span className="text-sm font-medium uppercase tracking-wide text-slate-500">
            {product.category_name}
          </span>
          <h1 className="mt-1 text-2xl font-bold text-slate-900 sm:text-3xl">{product.name}</h1>
          <p className="mt-4 text-3xl font-bold text-brand-700">{formatPrice(product.price)}</p>

          <p className={`mt-3 text-sm font-medium ${inStock ? 'text-emerald-600' : 'text-red-600'}`}>
            {inStock ? `In stock (${product.stock_quantity} available)` : 'Out of stock'}
          </p>

          {product.description && (
            <div className="mt-6">
              <h2 className="mb-2 text-sm font-semibold text-slate-900">Description</h2>
              <p className="whitespace-pre-line text-slate-600">{product.description}</p>
            </div>
          )}

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
    </div>
  )
}
