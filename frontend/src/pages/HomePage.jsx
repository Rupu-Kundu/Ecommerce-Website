import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import ErrorMessage from '../components/ErrorMessage'
import Loader from '../components/Loader'
import ProductGrid from '../components/ProductGrid'
import { getErrorMessage } from '../services/api'
import { getCategories, getProducts } from '../services/productService'

export default function HomePage() {
  const [products, setProducts] = useState([])
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError('')
      try {
        const [productData, categoryData] = await Promise.all([
          getProducts({ ordering: '-created_at' }),
          getCategories(),
        ])
        if (!cancelled) {
          setProducts(productData.results.slice(0, 8))
          setCategories(categoryData)
        }
      } catch (err) {
        if (!cancelled) setError(getErrorMessage(err, 'Could not load products.'))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [reloadKey])

  return (
    <div className="space-y-12">
      {/* Hero */}
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-brand-800 via-brand-700 to-brand-600 px-6 py-12 text-white sm:px-12 sm:py-16">
        <div aria-hidden="true" className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-accent-400/20 blur-3xl" />
        <div aria-hidden="true" className="pointer-events-none absolute -bottom-24 right-24 h-64 w-64 rounded-full bg-brand-300/20 blur-3xl" />
        <p className="relative text-sm font-semibold uppercase tracking-widest text-accent-300">Welcome to Haatbox</p>
        <h1 className="relative mt-2 max-w-xl text-3xl font-extrabold tracking-tight sm:text-5xl">Shop smart. Live better.</h1>
        <p className="relative mt-4 max-w-xl text-brand-100">
          Electronics, fashion, books, home, sports and beauty — delivered across Bangladesh.
          Free standard delivery on orders over ৳5,000.
        </p>
        <Link
          to="/products"
          className="relative mt-7 inline-block rounded-full bg-white px-6 py-3 font-semibold text-brand-800 shadow-lg shadow-brand-950/20 transition hover:-translate-y-0.5 hover:bg-brand-50"
        >
          Browse products
        </Link>
      </section>

      {loading && <Loader label="Loading products..." />}
      {!loading && error && <ErrorMessage message={error} onRetry={() => setReloadKey((k) => k + 1)} />}

      {!loading && !error && (
        <>
          {categories.length > 0 && (
            <section>
              <h2 className="mb-4 text-xl font-bold text-slate-900">Shop by category</h2>
              <div className="flex flex-wrap gap-2">
                {categories.map((category) => (
                  <Link
                    key={category.id}
                    to={`/products?category=${category.slug}`}
                    className="rounded-full border border-slate-300 bg-white px-4 py-1.5 text-sm font-medium text-slate-700 hover:border-brand-400 hover:text-brand-700"
                  >
                    {category.name}
                  </Link>
                ))}
              </div>
            </section>
          )}

          <section>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xl font-bold text-slate-900">New arrivals</h2>
              <Link to="/products" className="text-sm font-medium text-brand-700 hover:underline">
                View all →
              </Link>
            </div>
            <ProductGrid products={products} emptyMessage="No products yet." />
          </section>
        </>
      )}
    </div>
  )
}
