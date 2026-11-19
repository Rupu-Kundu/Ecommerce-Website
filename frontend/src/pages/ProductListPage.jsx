import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import ErrorMessage from '../components/ErrorMessage'
import Loader from '../components/Loader'
import Pagination from '../components/Pagination'
import ProductGrid from '../components/ProductGrid'
import { getErrorMessage } from '../services/api'
import { getCategories, getProducts } from '../services/productService'

const PAGE_SIZE = 12 // matches the backend's REST_FRAMEWORK PAGE_SIZE

const SORT_OPTIONS = [
  { value: '-created_at', label: 'Newest' },
  { value: 'price', label: 'Price: low to high' },
  { value: '-price', label: 'Price: high to low' },
  { value: 'name', label: 'Name: A–Z' },
]

export default function ProductListPage() {
  // Filters live in the URL so they survive refresh and can be shared/bookmarked.
  const [searchParams, setSearchParams] = useSearchParams()
  const search = searchParams.get('search') || ''
  const category = searchParams.get('category') || ''
  const ordering = searchParams.get('ordering') || '-created_at'
  const page = Number(searchParams.get('page')) || 1

  const [searchInput, setSearchInput] = useState(search)
  const [syncedSearch, setSyncedSearch] = useState(search)
  const [categories, setCategories] = useState([])
  const [data, setData] = useState({ count: 0, results: [] })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [reloadKey, setReloadKey] = useState(0)

  // Keep the search box in sync when the URL changes (e.g. back button).
  if (search !== syncedSearch) {
    setSyncedSearch(search)
    setSearchInput(search)
  }

  useEffect(() => {
    getCategories()
      .then(setCategories)
      .catch(() => setCategories([])) // filter just won't show categories
  }, [])

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError('')
      try {
        const result = await getProducts({ search, category, ordering, page })
        if (!cancelled) setData(result)
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
  }, [search, category, ordering, page, reloadKey])

  function updateParams(changes) {
    // Build from the latest URL (not a possibly stale render) so quick changes don't clash.
    setSearchParams((current) => {
      const next = new URLSearchParams(current)
      Object.entries(changes).forEach(([key, value]) => {
        if (value) next.set(key, value)
        else next.delete(key)
      })
      // Any filter change goes back to page 1, unless the page itself changed.
      if (!('page' in changes)) next.delete('page')
      return next
    })
  }

  function handleSearchSubmit(event) {
    event.preventDefault()
    updateParams({ search: searchInput.trim() })
  }

  function changePage(newPage) {
    updateParams({ page: newPage > 1 ? String(newPage) : '' })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const totalPages = Math.ceil(data.count / PAGE_SIZE)
  const hasFilters = search || category || ordering !== '-created_at'
  const selectClass =
    'rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-200'

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-slate-900">Products</h1>

      {/* Filters */}
      <div className="mb-6 flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 md:flex-row md:items-center">
        <form onSubmit={handleSearchSubmit} className="flex flex-1 gap-2" role="search">
          <input
            type="search"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search products..."
            aria-label="Search products"
            className="min-w-0 flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-200"
          />
          <button type="submit" className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700">
            Search
          </button>
        </form>
        <div className="flex gap-2">
          <select
            aria-label="Filter by category"
            value={category}
            onChange={(e) => updateParams({ category: e.target.value })}
            className={`${selectClass} flex-1`}
          >
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.slug}>
                {c.name}
              </option>
            ))}
          </select>
          <select
            aria-label="Sort products"
            value={ordering}
            onChange={(e) => updateParams({ ordering: e.target.value === '-created_at' ? '' : e.target.value })}
            className={`${selectClass} flex-1`}
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {!loading && !error && (
        <div className="mb-4 flex items-center justify-between text-sm text-slate-600">
          <span>
            {data.count} {data.count === 1 ? 'product' : 'products'} found
          </span>
          {hasFilters && (
            <button type="button" onClick={() => setSearchParams({})} className="font-medium text-brand-700 hover:underline">
              Clear filters
            </button>
          )}
        </div>
      )}

      {loading && <Loader label="Loading products..." />}
      {!loading && error && <ErrorMessage message={error} onRetry={() => setReloadKey((k) => k + 1)} />}
      {!loading && !error && (
        <>
          <ProductGrid products={data.results} emptyMessage="No products match your search." />
          <Pagination page={page} totalPages={totalPages} onChange={changePage} />
        </>
      )}
    </div>
  )
}
