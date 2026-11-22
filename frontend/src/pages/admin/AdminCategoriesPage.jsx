import { useState } from 'react'
import { Link } from 'react-router-dom'
import { EmptyState, ErrorBanner, FilterSelect, ListSkeleton, SearchBox, SummaryChip } from '../../components/admin/ListControls'
import { cardClass } from '../../components/admin/styles'
import ErrorMessage from '../../components/ErrorMessage'
import Pagination from '../../components/Pagination'
import useApiData from '../../hooks/useApiData'
import useUrlFilters from '../../hooks/useUrlFilters'
import { createCategory, deleteCategory, updateCategory } from '../../services/adminService'
import { getErrorMessage } from '../../services/api'
import { getCategories } from '../../services/productService'

const EMPTY = { name: '', description: '' }
const PAGE_SIZE = 10 // categories come in one list; paged here in the browser
const SORTS = {
  '': (a, b) => a.name.localeCompare(b.name),
  '-name': (a, b) => b.name.localeCompare(a.name),
  products: (a, b) => b.product_count - a.product_count || a.name.localeCompare(b.name),
  '-products': (a, b) => a.product_count - b.product_count || a.name.localeCompare(b.name),
}

export default function AdminCategoriesPage() {
  const { values, page, update } = useUrlFilters(['search', 'ordering', 'show'])
  const { data: categories, error: loadError, loading, reload } = useApiData('categories', getCategories, 'Could not load categories.')
  const [form, setForm] = useState(EMPTY)
  const [editingId, setEditingId] = useState(null)
  const [fieldErrors, setFieldErrors] = useState({})
  const [message, setMessage] = useState(null) // {type, text}
  const [saving, setSaving] = useState(false)

  function startEdit(c) {
    setEditingId(c.id)
    setForm({ name: c.name, description: c.description || '' })
    setFieldErrors({})
    setMessage(null)
    document.getElementById('cat-name')?.focus()
  }

  function reset() {
    setEditingId(null)
    setForm(EMPTY)
    setFieldErrors({})
  }

  async function submit(e) {
    e.preventDefault()
    if (!form.name.trim()) {
      setFieldErrors({ name: 'Name is required.' })
      return
    }
    setSaving(true)
    try {
      const fields = { name: form.name.trim(), description: form.description.trim() }
      const saved = editingId ? await updateCategory(editingId, fields) : await createCategory(fields)
      setMessage({ type: 'ok', text: `Category “${saved.name}” ${editingId ? 'updated' : 'created'}.` })
      reset()
      reload()
    } catch (err) {
      const data = err.response?.data
      if (err.response?.status === 400 && data && typeof data === 'object') setFieldErrors(data)
      setMessage({ type: 'error', text: getErrorMessage(err, 'Could not save the category.') })
    } finally {
      setSaving(false)
    }
  }

  async function remove(c) {
    if (!window.confirm(`Delete category “${c.name}”?`)) return
    try {
      await deleteCategory(c.id)
      setMessage({ type: 'ok', text: `Category “${c.name}” deleted.` })
      if (editingId === c.id) reset()
      reload()
    } catch (err) {
      setMessage({ type: 'error', text: getErrorMessage(err, 'Could not delete the category.') })
    }
  }

  const err = (k) => fieldErrors[k] && <p className="mt-1 text-xs text-red-600">{[].concat(fieldErrors[k]).join(' ')}</p>

  // search / filter / sort / page in the browser
  const q = values.search.toLowerCase()
  const all = categories || []
  const visible = all
    .filter((c) => !q || c.name.toLowerCase().includes(q) || c.slug.includes(q) || (c.description || '').toLowerCase().includes(q))
    .filter((c) => (values.show === 'empty' ? c.product_count === 0 : values.show === 'used' ? c.product_count > 0 : true))
    .sort(SORTS[values.ordering] || SORTS[''])
  const totalPages = Math.max(1, Math.ceil(visible.length / PAGE_SIZE))
  const current = Math.min(page, totalPages)
  const rows = visible.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE)
  const productTotal = all.reduce((s, c) => s + c.product_count, 0)
  const emptyCount = all.filter((c) => c.product_count === 0).length
  const hasFilters = Boolean(values.search || values.show)

  return (
    <div className="space-y-5">
      {categories && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3" data-testid="category-summary">
          <SummaryChip label="Categories" value={all.length} testId="sum-categories" onClick={() => update({ show: '' })} active={!values.show} />
          <SummaryChip label="Products in them" value={productTotal} note={all.length ? `≈ ${Math.round(productTotal / all.length)} per category` : ''} testId="sum-cat-products" />
          <SummaryChip label="Empty categories" value={emptyCount} note="Safe to delete" tone={emptyCount ? 'amber' : 'slate'} testId="sum-empty" onClick={() => update({ show: values.show === 'empty' ? '' : 'empty' })} active={values.show === 'empty'} />
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <section className={`${cardClass} min-w-0`} aria-labelledby="cat-heading">
          <div className="space-y-3 border-b border-slate-200 p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 id="cat-heading" className="text-lg font-bold text-slate-900">
                Categories {categories && <span className="text-sm font-medium text-slate-500" data-testid="category-count">({visible.length} {hasFilters ? 'found' : 'total'})</span>}
              </h2>
              {hasFilters && <button type="button" onClick={() => update({ search: '', show: '' })} className="text-sm font-semibold text-brand-700 hover:underline">Clear filters</button>}
            </div>
            <div className="grid gap-2 sm:grid-cols-3">
              <SearchBox id="category-search" label="Search categories" value={values.search} onSearch={(v) => update({ search: v })} placeholder="Name or slug…" delay={150} />
              <FilterSelect id="cat-show" label="Show" value={values.show} onChange={(v) => update({ show: v })} options={[['', 'All categories'], ['used', 'With products'], ['empty', 'Empty']]} />
              <FilterSelect id="cat-sort" label="Sort by" value={values.ordering} onChange={(v) => update({ ordering: v })} options={[['', 'Name A–Z'], ['-name', 'Name Z–A'], ['products', 'Most products'], ['-products', 'Fewest products']]} />
            </div>
          </div>

          {!categories && loading ? (
            <ListSkeleton label="Loading categories" rows={5} />
          ) : !categories && loadError ? (
            <div className="p-5"><ErrorMessage message={loadError} onRetry={reload} /></div>
          ) : (
            <div className={`transition-opacity ${loading ? 'opacity-60' : ''}`} aria-busy={loading}>
              {loadError && <ErrorBanner message={loadError} onRetry={reload} />}
              {rows.length === 0 ? (
                <EmptyState testId="categories-empty" title={hasFilters ? 'No categories match' : 'No categories yet'} hint={hasFilters ? 'Try a different search.' : 'Add your first category with the form.'} />
              ) : (
                <ul className="divide-y divide-slate-100">
                  {rows.map((c) => (
                    <li key={c.id} className={`flex flex-wrap items-center gap-3 px-5 py-4 ${editingId === c.id ? 'bg-brand-50/60' : ''}`} data-testid="admin-category-row">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-sm font-bold text-brand-800" aria-hidden="true">{c.name.charAt(0)}</span>
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-slate-900">{c.name}</p>
                        <p className="truncate text-xs text-slate-500">/{c.slug}{c.description && ` · ${c.description}`}</p>
                      </div>
                      <Link
                        to={`/admin-dashboard/products?category=${c.slug}`}
                        className={`whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${c.product_count ? 'bg-slate-100 text-slate-700 hover:bg-slate-200' : 'bg-amber-50 text-amber-800'}`}
                        title="Show these products"
                      >
                        {c.product_count} {c.product_count === 1 ? 'product' : 'products'}
                      </Link>
                      <div className="flex gap-1">
                        <button type="button" onClick={() => startEdit(c)} className="rounded-full px-3 py-1 text-sm font-semibold text-brand-700 hover:bg-brand-50" aria-label={`Edit ${c.name}`}>Edit</button>
                        <button type="button" onClick={() => remove(c)} className="rounded-full px-3 py-1 text-sm font-semibold text-red-600 hover:bg-red-50" aria-label={`Delete ${c.name}`}>Delete</button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              <div className="px-4 pb-5">
                <Pagination page={current} totalPages={totalPages} onChange={(p) => update({ page: p > 1 ? p : '' }, { resetPage: false })} />
              </div>
            </div>
          )}
        </section>

        <form onSubmit={submit} noValidate className={`${cardClass} h-fit p-5 lg:sticky lg:top-24`} aria-label="Category form">
          <h2 className="mb-4 text-lg font-bold text-slate-900">{editingId ? 'Edit category' : 'Add category'}</h2>
          {message && (
            <div role={message.type === 'error' ? 'alert' : 'status'} className={`mb-4 rounded-lg px-3 py-2 text-sm ${message.type === 'error' ? 'bg-red-50 text-red-700' : 'bg-brand-50 text-brand-800'}`}>
              {message.text}
            </div>
          )}
          <label htmlFor="cat-name" className="mb-1 block text-sm font-medium text-slate-700">Name</label>
          <input id="cat-name" value={form.name} maxLength={100} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} aria-invalid={Boolean(fieldErrors.name)} className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-100" />
          {err('name')}
          {err('slug')}
          <label htmlFor="cat-desc" className="mb-1 mt-3 block text-sm font-medium text-slate-700">Description</label>
          <textarea id="cat-desc" rows={3} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-100" />
          <p className="mt-1 text-xs text-slate-500">The URL slug is made from the name. A category that still has products can't be deleted.</p>
          <div className="mt-4 flex gap-2">
            <button type="submit" disabled={saving} className="flex-1 rounded-full bg-brand-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-800 disabled:opacity-60">
              {saving ? 'Saving…' : editingId ? 'Save changes' : 'Add category'}
            </button>
            {editingId && <button type="button" onClick={reset} className="rounded-full px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-100">Cancel</button>}
          </div>
        </form>
      </div>
    </div>
  )
}
