import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import ErrorMessage from '../components/ErrorMessage'
import Loader from '../components/Loader'
import ProductImage from '../components/ProductImage'
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

  return (
    <div>
      <nav className="mb-6 text-sm text-slate-500" aria-label="Breadcrumb">
        <Link to="/products" className="hover:text-indigo-700">Products</Link>
        <span className="mx-2">/</span>
        <Link to={`/products?category=${product.category_slug}`} className="hover:text-indigo-700">
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
          <p className="mt-4 text-3xl font-bold text-indigo-700">{formatPrice(product.price)}</p>

          <p className={`mt-3 text-sm font-medium ${inStock ? 'text-emerald-600' : 'text-red-600'}`}>
            {inStock ? `In stock (${product.stock_quantity} available)` : 'Out of stock'}
          </p>

          {product.description && (
            <div className="mt-6">
              <h2 className="mb-2 text-sm font-semibold text-slate-900">Description</h2>
              <p className="whitespace-pre-line text-slate-600">{product.description}</p>
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
