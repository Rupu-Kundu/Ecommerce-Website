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
      <section className="rounded-2xl bg-gradient-to-r from-indigo-600 to-violet-600 px-6 py-12 text-white sm:px-10 sm:py-16">
        <h1 className="text-3xl font-bold sm:text-4xl">Shop smart. Shop easy.</h1>
        <p className="mt-3 max-w-xl text-indigo-100">
          Electronics, clothing, books, and home essentials — all in one place.
        </p>
        <Link
          to="/products"
          className="mt-6 inline-block rounded-lg bg-white px-5 py-2.5 font-semibold text-indigo-700 shadow hover:bg-indigo-50"
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
                    className="rounded-full border border-slate-300 bg-white px-4 py-1.5 text-sm font-medium text-slate-700 hover:border-indigo-400 hover:text-indigo-700"
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
              <Link to="/products" className="text-sm font-medium text-indigo-700 hover:underline">
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
