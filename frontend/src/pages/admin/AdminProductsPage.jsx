import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import ErrorMessage from '../../components/ErrorMessage'
import Loader from '../../components/Loader'
import Pagination from '../../components/Pagination'
import ProductImage from '../../components/ProductImage'
import { deleteProduct, getAdminProducts } from '../../services/adminService'
import { getErrorMessage } from '../../services/api'
import { getCategories } from '../../services/productService'
import { formatPrice } from '../../utils/format'
import AdminProductForm from './AdminProductForm'

const PAGE_SIZE = 12
const LOW_STOCK = 5

export default function AdminProductsPage() {
  const [params, setParams] = useSearchParams()
  const page = Number(params.get('page')) || 1
  const search = params.get('search') || ''
  const category = params.get('category') || ''
  const lowStock = params.get('low_stock') === 'true'

  const [data, setData] = useState(null)
  const [categories, setCategories] = useState([])
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [editing, setEditing] = useState(undefined) // undefined = closed, null = new, object = edit
  const [reloadKey, setReloadKey] = useState(0)
  const [searchInput, setSearchInput] = useState(search)

  useEffect(() => {
    getCategories().then(setCategories).catch(() => setCategories([]))
  }, [])

  useEffect(() => {
    let cancelled = false
    getAdminProducts({ page, search, category, low_stock: lowStock ? 'true' : '', ordering: lowStock ? 'stock_quantity' : '-created_at' })
      .then((d) => {
        if (!cancelled) {
          setData(d)
          setError('')
        }
      })
      .catch((err) => !cancelled && setError(getErrorMessage(err, 'Could not load products.')))
    return () => {
      cancelled = true
    }
  }, [page, search, category, lowStock, reloadKey])

  function update(changes) {
    setParams((current) => {
      const next = new URLSearchParams(current)
      Object.entries(changes).forEach(([k, v]) => (v ? next.set(k, v) : next.delete(k)))
      if (!('page' in changes)) next.delete('page')
      return next
    })
  }

  async function remove(product) {
    if (!window.confirm(`Delete “${product.name}”? This cannot be undone.`)) return
    try {
      await deleteProduct(product.id)
      setNotice(`Deleted “${product.name}”.`)
      setReloadKey((k) => k + 1)
    } catch (err) {
      setNotice('')
      setError(getErrorMessage(err, 'Could not delete the product.'))
    }
  }

  function saved(product, action) {
    setEditing(undefined)
    setNotice(`Product “${product.name}” ${action}.`)
    setReloadKey((k) => k + 1)
  }

  return (
    <div>
      <div className="mb-4 flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-3 lg:flex-row lg:items-center">
        <form className="flex flex-1 gap-2" role="search" onSubmit={(e) => { e.preventDefault(); update({ search: searchInput.trim() }) }}>
          <input type="search" value={searchInput} onChange={(e) => setSearchInput(e.target.value)} placeholder="Search products…" aria-label="Search products" className="min-w-0 flex-1 rounded-full border border-slate-300 px-4 py-2 text-sm" />
          <button type="submit" className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white">Search</button>
        </form>
        <div className="flex flex-wrap items-center gap-2">
          <select aria-label="Filter by category" value={category} onChange={(e) => update({ category: e.target.value })} className="rounded-full border border-slate-300 px-3 py-2 text-sm">
            <option value="">All categories</option>
            {categories.map((c) => <option key={c.id} value={c.slug}>{c.name}</option>)}
          </select>
          <label className="flex items-center gap-2 rounded-full border border-slate-300 px-3 py-2 text-sm font-medium">
            <input type="checkbox" checked={lowStock} onChange={(e) => update({ low_stock: e.target.checked ? 'true' : '' })} className="accent-brand-700" />
            Low stock only
          </label>
          <button type="button" onClick={() => setEditing(null)} className="rounded-full bg-brand-700 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-800">
            + Add product
          </button>
        </div>
      </div>

      {notice && <div role="status" className="mb-4 rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-800">{notice}</div>}
      {error && <ErrorMessage message={error} onRetry={() => { setError(''); setReloadKey((k) => k + 1) }} />}
      {!data && !error && <Loader label="Loading products…" />}

      {data && (
        <>
          <p className="mb-2 text-sm text-slate-500">{data.count} products</p>
          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Product</th>
                  <th className="px-4 py-3">Category</th>
                  <th className="px-4 py-3 text-right">Price</th>
                  <th className="px-4 py-3 text-right">Stock</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.results.map((p) => (
                  <tr key={p.id} data-testid="admin-product-row">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-slate-100"><ProductImage product={p} className="text-sm" /></div>
                        <span className="font-semibold text-slate-900">{p.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{p.category_name}</td>
                    <td className="px-4 py-3 text-right font-medium tabular-nums">{formatPrice(p.price)}</td>
                    <td className={`px-4 py-3 text-right font-semibold tabular-nums ${p.stock_quantity <= LOW_STOCK ? 'text-amber-600' : 'text-slate-900'}`}>{p.stock_quantity}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${p.is_available ? 'bg-brand-50 text-brand-800' : 'bg-slate-100 text-slate-500'}`}>
                        {p.is_available ? 'Available' : 'Hidden'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button type="button" onClick={() => setEditing(p)} className="rounded-full px-3 py-1 text-sm font-semibold text-brand-700 hover:bg-brand-50" aria-label={`Edit ${p.name}`}>Edit</button>
                      <button type="button" onClick={() => remove(p)} className="rounded-full px-3 py-1 text-sm font-semibold text-red-600 hover:bg-red-50" aria-label={`Delete ${p.name}`}>Delete</button>
                    </td>
                  </tr>
                ))}
                {data.results.length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-500">No products match.</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <Pagination page={page} totalPages={Math.ceil(data.count / PAGE_SIZE)} onChange={(p) => update({ page: p > 1 ? String(p) : '' })} />
        </>
      )}

      {editing !== undefined && (
        <AdminProductForm product={editing} categories={categories} onClose={() => setEditing(undefined)} onSaved={saved} />
      )}
    </div>
  )
}
