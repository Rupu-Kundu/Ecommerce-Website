import { useEffect, useState } from 'react'
import ErrorMessage from '../../components/ErrorMessage'
import Loader from '../../components/Loader'
import { createCategory, deleteCategory, updateCategory } from '../../services/adminService'
import { getErrorMessage } from '../../services/api'
import { getCategories } from '../../services/productService'

const EMPTY = { name: '', description: '' }

export default function AdminCategoriesPage() {
  const [categories, setCategories] = useState(null)
  const [loadError, setLoadError] = useState('')
  const [form, setForm] = useState(EMPTY)
  const [editingId, setEditingId] = useState(null)
  const [fieldErrors, setFieldErrors] = useState({})
  const [message, setMessage] = useState(null) // {type, text}
  const [saving, setSaving] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let cancelled = false
    getCategories()
      .then((d) => !cancelled && setCategories(d))
      .catch((err) => !cancelled && setLoadError(getErrorMessage(err, 'Could not load categories.')))
    return () => {
      cancelled = true
    }
  }, [reloadKey])

  function startEdit(c) {
    setEditingId(c.id)
    setForm({ name: c.name, description: c.description || '' })
    setFieldErrors({})
    setMessage(null)
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
      setReloadKey((k) => k + 1)
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
      setReloadKey((k) => k + 1)
    } catch (err) {
      setMessage({ type: 'error', text: getErrorMessage(err, 'Could not delete the category.') })
    }
  }

  if (loadError) return <ErrorMessage message={loadError} />
  if (!categories) return <Loader label="Loading categories…" />

  const err = (k) => fieldErrors[k] && <p className="mt-1 text-xs text-red-600">{[].concat(fieldErrors[k]).join(' ')}</p>

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white" aria-label="Categories">
        <ul className="divide-y divide-slate-100">
          {categories.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4" data-testid="admin-category-row">
              <div className="min-w-0">
                <p className="font-semibold text-slate-900">{c.name}</p>
                <p className="truncate text-xs text-slate-500">/{c.slug} · {c.product_count} products{c.description && ` · ${c.description}`}</p>
              </div>
              <div className="flex gap-1">
                <button type="button" onClick={() => startEdit(c)} className="rounded-full px-3 py-1 text-sm font-semibold text-brand-700 hover:bg-brand-50" aria-label={`Edit ${c.name}`}>Edit</button>
                <button type="button" onClick={() => remove(c)} className="rounded-full px-3 py-1 text-sm font-semibold text-red-600 hover:bg-red-50" aria-label={`Delete ${c.name}`}>Delete</button>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <form onSubmit={submit} noValidate className="h-fit rounded-2xl border border-slate-200 bg-white p-5" aria-label="Category form">
        <h2 className="mb-4 text-lg font-bold text-slate-900">{editingId ? 'Edit category' : 'Add category'}</h2>
        {message && (
          <div role={message.type === 'error' ? 'alert' : 'status'} className={`mb-4 rounded-lg px-3 py-2 text-sm ${message.type === 'error' ? 'bg-red-50 text-red-700' : 'bg-brand-50 text-brand-800'}`}>
            {message.text}
          </div>
        )}
        <label htmlFor="cat-name" className="mb-1 block text-sm font-medium text-slate-700">Name</label>
        <input id="cat-name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
        {err('name')}
        {err('slug')}
        <label htmlFor="cat-desc" className="mb-1 mt-3 block text-sm font-medium text-slate-700">Description</label>
        <textarea id="cat-desc" rows={3} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
        <div className="mt-4 flex gap-2">
          <button type="submit" disabled={saving} className="flex-1 rounded-full bg-brand-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-800 disabled:opacity-60">
            {saving ? 'Saving…' : editingId ? 'Save changes' : 'Add category'}
          </button>
          {editingId && <button type="button" onClick={reset} className="rounded-full px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-100">Cancel</button>}
        </div>
      </form>
    </div>
  )
}
