import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { EmptyState, ErrorBanner, FilterSelect, ListSkeleton, SearchBox, SummaryChip } from '../../components/admin/ListControls'
import { cardClass } from '../../components/admin/styles'
import ErrorMessage from '../../components/ErrorMessage'
import Pagination from '../../components/Pagination'
import ProductImage from '../../components/ProductImage'
import StarRating from '../../components/product/StarRating'
import useApiData from '../../hooks/useApiData'
import useUrlFilters from '../../hooks/useUrlFilters'
import { deleteProduct, getAdminProducts, getAdminStats, updateProduct } from '../../services/adminService'
import { getErrorMessage } from '../../services/api'
import { getCategories } from '../../services/productService'
import { formatPrice } from '../../utils/format'
import AdminProductForm from './AdminProductForm'

const PAGE_SIZE = 12
const LOW_STOCK = 5
const KEYS = ['search', 'category', 'available', 'stock', 'low_stock', 'ordering']
const SORTS = [
  ['', 'Newest first'], ['created_at', 'Oldest first'], ['name', 'Name A–Z'], ['-name', 'Name Z–A'],
  ['price', 'Price: low to high'], ['-price', 'Price: high to low'], ['stock_quantity', 'Stock: lowest first'],
  ['-stock_quantity', 'Stock: highest first'], ['-rating_score', 'Top rated'],
]

function StockBadge({ qty }) {
  if (qty === 0) return <span className="whitespace-nowrap rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-700">Out of stock</span>
  if (qty <= LOW_STOCK) return <span className="whitespace-nowrap rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-800">{qty} left</span>
  return <span className="tabular-nums text-slate-700">{qty}</span>
}

function VisibilityBadge({ available }) {
  return (
    <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ${available ? 'bg-brand-50 text-brand-800' : 'bg-slate-100 text-slate-500'}`}>
      {available ? 'Available' : 'Hidden'}
    </span>
  )
}

export default function AdminProductsPage() {
  const { values, page, update } = useUrlFilters(KEYS)
  // "Restock" (≤ 5 left, incl. sold out) keeps the old ?low_stock=true link working.
  const stockChoice = values.low_stock === 'true' ? 'restock' : values.stock
  const query = {
    search: values.search, category: values.category, available: values.available,
    stock: stockChoice === 'restock' ? '' : stockChoice, low_stock: stockChoice === 'restock' ? 'true' : '',
    ordering: values.ordering || '-created_at', page,
  }
  const { data, error, loading, reload } = useApiData(JSON.stringify(query), () => getAdminProducts(query), 'Could not load products.', (err) => {
    if (err.response?.status === 404 && page > 1) {
      update({ page: '' })
      return true
    }
    return false
  })
  const [categories, setCategories] = useState([])
  const [stats, setStats] = useState(null)
  const [statsKey, setStatsKey] = useState(0)
  const [notice, setNotice] = useState(null) // {type, text}
  const [editing, setEditing] = useState(undefined) // undefined = closed, null = new, object = edit
  const [busyId, setBusyId] = useState(null)

  useEffect(() => {
    getCategories().then(setCategories).catch(() => setCategories([]))
  }, [])
  useEffect(() => {
    getAdminStats(7).then(setStats).catch(() => setStats(null))
  }, [statsKey])

  function refresh() {
    reload()
    setStatsKey((k) => k + 1)
  }

  function setStock(choice) {
    update(choice === 'restock' ? { low_stock: 'true', stock: '' } : { low_stock: '', stock: choice })
  }

  async function remove(product) {
    if (!window.confirm(`Delete “${product.name}”? This cannot be undone.`)) return
    setBusyId(product.id)
    try {
      await deleteProduct(product.id)
      setNotice({ type: 'ok', text: `Deleted “${product.name}”.` })
      refresh()
    } catch (err) {
      setNotice({ type: 'error', text: getErrorMessage(err, 'Could not delete the product.') })
    } finally {
      setBusyId(null)
    }
  }

  async function toggleVisibility(product) {
    setBusyId(product.id)
    try {
      await updateProduct(product.id, { is_available: !product.is_available })
      setNotice({ type: 'ok', text: `“${product.name}” is now ${product.is_available ? 'hidden from' : 'visible in'} the store.` })
      refresh()
    } catch (err) {
      setNotice({ type: 'error', text: getErrorMessage(err, 'Could not change the product.') })
    } finally {
      setBusyId(null)
    }
  }

  function saved(product, action) {
    setEditing(undefined)
    setNotice({ type: 'ok', text: `Product “${product.name}” ${action}.` })
    refresh()
  }

  const hasFilters = Boolean(values.search || values.category || values.available || stockChoice)
  const actions = (p) => (
    <div className="flex flex-wrap justify-end gap-1">
      <button type="button" onClick={() => setEditing(p)} disabled={busyId === p.id} className="rounded-full px-3 py-1 text-sm font-semibold text-brand-700 hover:bg-brand-50" aria-label={`Edit ${p.name}`}>Edit</button>
      <button type="button" onClick={() => toggleVisibility(p)} disabled={busyId === p.id} className="rounded-full px-3 py-1 text-sm font-semibold text-slate-600 hover:bg-slate-100" aria-label={`${p.is_available ? 'Hide' : 'Show'} ${p.name}`}>
        {p.is_available ? 'Hide' : 'Show'}
      </button>
      <button type="button" onClick={() => remove(p)} disabled={busyId === p.id} className="rounded-full px-3 py-1 text-sm font-semibold text-red-600 hover:bg-red-50" aria-label={`Delete ${p.name}`}>Delete</button>
    </div>
  )

  return (
    <div className="space-y-5">
      {stats && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" data-testid="product-summary">
          <SummaryChip label="Products" value={stats.product_count} note="In the catalogue" testId="sum-products" onClick={() => update({ available: '', stock: '', low_stock: '' })} active={!values.available && !stockChoice} />
          <SummaryChip label="Hidden" value={stats.hidden_product_count} note="Not shown in the store" testId="sum-hidden" onClick={() => update({ available: values.available === 'false' ? '' : 'false' })} active={values.available === 'false'} />
          <SummaryChip label="Restock" value={stats.low_stock_count} note={`${LOW_STOCK} or fewer left`} tone="amber" testId="sum-restock" onClick={() => setStock(stockChoice === 'restock' ? '' : 'restock')} active={stockChoice === 'restock'} />
          <SummaryChip label="Out of stock" value={stats.out_of_stock_count} note="Can't be ordered" tone="red" testId="sum-out" onClick={() => setStock(stockChoice === 'out' ? '' : 'out')} active={stockChoice === 'out'} />
        </div>
      )}

      <section className={cardClass} aria-labelledby="products-heading">
        <div className="space-y-3 border-b border-slate-200 p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="products-heading" className="text-lg font-bold text-slate-900">
              Products {data && <span className="text-sm font-medium text-slate-500" data-testid="product-count">({data.count} {hasFilters ? 'found' : 'total'})</span>}
            </h2>
            <div className="flex items-center gap-3">
              {hasFilters && (
                <button type="button" onClick={() => update({ search: '', category: '', available: '', stock: '', low_stock: '' })} className="text-sm font-semibold text-brand-700 hover:underline">Clear filters</button>
              )}
              <button type="button" onClick={() => setEditing(null)} className="rounded-full bg-brand-700 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-800">+ Add product</button>
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
            <div className="sm:col-span-2 lg:col-span-1">
              <SearchBox id="product-search" label="Search products" value={values.search} onSearch={(v) => update({ search: v })} placeholder="Name, brand, description…" />
            </div>
            <FilterSelect id="prod-category" label="Category" value={values.category} onChange={(v) => update({ category: v })} options={[['', 'All categories'], ...categories.map((c) => [c.slug, c.name])]} />
            <FilterSelect id="prod-available" label="Visibility" value={values.available} onChange={(v) => update({ available: v })} options={[['', 'Visible & hidden'], ['true', 'Available'], ['false', 'Hidden']]} />
            <FilterSelect id="prod-stock" label="Stock" value={stockChoice} onChange={setStock} options={[['', 'Any stock'], ['in', 'In stock (6+)'], ['restock', 'Restock (≤ 5)'], ['low', 'Low (1–5)'], ['out', 'Out of stock']]} />
            <FilterSelect id="prod-sort" label="Sort by" value={values.ordering} onChange={(v) => update({ ordering: v })} options={SORTS} />
          </div>
        </div>

        {notice && (
          <div role={notice.type === 'error' ? 'alert' : 'status'} className={`mx-4 mt-4 rounded-xl px-4 py-2 text-sm ${notice.type === 'error' ? 'bg-red-50 text-red-700' : 'bg-brand-50 text-brand-800'}`}>
            {notice.text}
          </div>
        )}

        {!data && loading ? (
          <ListSkeleton label="Loading products" />
        ) : !data && error ? (
          <div className="p-5"><ErrorMessage message={error} onRetry={reload} /></div>
        ) : (
          <div className={`transition-opacity ${loading ? 'opacity-60' : ''}`} aria-busy={loading}>
            {error && <ErrorBanner message={error} onRetry={reload} />}
            {data.results.length === 0 ? (
              <EmptyState testId="products-empty" title={hasFilters ? 'No products match these filters' : 'No products yet'} hint={hasFilters ? 'Try a different search or clear the filters.' : 'Add your first product to start selling.'} />
            ) : (
              <>
                <div className="hidden overflow-x-auto lg:block">
                  <table className="w-full text-sm" data-testid="products-table">
                    <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="px-5 py-3 font-semibold">Product</th>
                        <th className="px-3 py-3 font-semibold">Category</th>
                        <th className="px-3 py-3 text-right font-semibold">Price</th>
                        <th className="px-3 py-3 text-right font-semibold">Stock</th>
                        <th className="px-3 py-3 font-semibold">Rating</th>
                        <th className="px-3 py-3 font-semibold">Status</th>
                        <th className="px-5 py-3 text-right font-semibold">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {data.results.map((p) => (
                        <tr key={p.id} className="hover:bg-slate-50" data-testid="admin-product-row">
                          <td className="px-5 py-3">
                            <div className="flex items-center gap-3">
                              <div className="h-11 w-11 shrink-0 overflow-hidden rounded-lg bg-slate-100"><ProductImage product={p} className="text-sm" /></div>
                              <div className="min-w-0">
                                <Link to={`/products/${p.id}`} className="font-semibold text-slate-900 hover:text-brand-700">{p.name}</Link>
                                <p className="text-xs text-slate-500">{p.brand || '—'} · {1 + (p.images?.length || 0)} photos</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-3 py-3 text-slate-600">{p.category_name}</td>
                          <td className="whitespace-nowrap px-3 py-3 text-right font-medium tabular-nums">{formatPrice(p.price)}</td>
                          <td className="px-3 py-3 text-right"><StockBadge qty={p.stock_quantity} /></td>
                          <td className="px-3 py-3">{p.rating_count > 0 ? <StarRating value={p.average_rating} count={p.rating_count} /> : <span className="text-xs text-slate-400">No ratings</span>}</td>
                          <td className="px-3 py-3"><VisibilityBadge available={p.is_available} /></td>
                          <td className="px-5 py-3">{actions(p)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <ul className="divide-y divide-slate-100 lg:hidden" data-testid="products-cards">
                  {data.results.map((p) => (
                    <li key={p.id} className="flex gap-3 px-4 py-4" data-testid="admin-product-card">
                      <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-slate-100"><ProductImage product={p} className="text-sm" /></div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <p className="font-semibold text-slate-900">{p.name}</p>
                          <VisibilityBadge available={p.is_available} />
                        </div>
                        <p className="text-xs text-slate-500">{p.category_name}{p.brand ? ` · ${p.brand}` : ''}</p>
                        <div className="mt-1 flex flex-wrap items-center gap-3 text-sm">
                          <span className="font-semibold tabular-nums">{formatPrice(p.price)}</span>
                          <StockBadge qty={p.stock_quantity} />
                        </div>
                        <div className="-mx-3 mt-1">{actions(p)}</div>
                      </div>
                    </li>
                  ))}
                </ul>
              </>
            )}
            <div className="px-4 pb-5">
              <Pagination page={page} totalPages={data ? Math.max(1, Math.ceil(data.count / PAGE_SIZE)) : 1} onChange={(p) => update({ page: p > 1 ? p : '' }, { resetPage: false })} />
            </div>
          </div>
        )}
      </section>

      {editing !== undefined && (
        <AdminProductForm product={editing} categories={categories} onClose={() => setEditing(undefined)} onSaved={saved} />
      )}
    </div>
  )
}
