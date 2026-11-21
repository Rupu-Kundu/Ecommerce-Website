import { useEffect, useState } from 'react'
import FormField from '../../components/FormField'
import { createProduct, updateProduct } from '../../services/adminService'
import { getErrorMessage } from '../../services/api'

const EMPTY = { name: '', category: '', price: '', stock_quantity: '0', description: '', is_available: true }

/** Create / edit a product in a dialog. `product` = null for a new product. */
export default function AdminProductForm({ product, categories, onClose, onSaved }) {
  const [form, setForm] = useState(() =>
    product
      ? {
          name: product.name,
          category: String(product.category),
          price: String(Number(product.price)),
          stock_quantity: String(product.stock_quantity),
          description: product.description || '',
          is_available: product.is_available,
        }
      : EMPTY,
  )
  const [image, setImage] = useState(null)
  const [preview, setPreview] = useState(product?.image || null)
  const [errors, setErrors] = useState({})
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  // Close with Escape.
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  // Free the temporary preview URL.
  useEffect(() => () => preview?.startsWith('blob:') && URL.revokeObjectURL(preview), [preview])

  function change(e) {
    const { name, value, type, checked } = e.target
    setForm((f) => ({ ...f, [name]: type === 'checkbox' ? checked : value }))
    setErrors((errs) => ({ ...errs, [name]: undefined }))
  }

  function pickImage(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setImage(file)
    setPreview(URL.createObjectURL(file))
    setErrors((errs) => ({ ...errs, image: undefined }))
  }

  function validate() {
    const errs = {}
    if (!form.name.trim()) errs.name = 'Name is required.'
    if (!form.category) errs.category = 'Choose a category.'
    if (!(Number(form.price) > 0)) errs.price = 'Price must be greater than 0.'
    if (!(Number.isInteger(Number(form.stock_quantity)) && Number(form.stock_quantity) >= 0)) errs.stock_quantity = 'Stock must be 0 or more.'
    return errs
  }

  async function submit(e) {
    e.preventDefault()
    setError('')
    const errs = validate()
    setErrors(errs)
    if (Object.keys(errs).length) return
    setSaving(true)
    try {
      const fields = { ...form, name: form.name.trim(), image }
      const saved = product ? await updateProduct(product.id, fields) : await createProduct(fields)
      onSaved(saved, product ? 'updated' : 'created')
    } catch (err) {
      const data = err.response?.data
      if (err.response?.status === 400 && data && typeof data === 'object') setErrors(data)
      setError(getErrorMessage(err, 'Could not save the product. Check the highlighted fields.'))
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-slate-900/40 p-0 sm:items-center sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-labelledby="product-form-title" className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-t-3xl bg-white p-6 shadow-2xl sm:rounded-3xl">
        <div className="mb-5 flex items-center justify-between">
          <h2 id="product-form-title" className="text-xl font-bold text-slate-900">{product ? `Edit “${product.name}”` : 'Add product'}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-full p-2 text-slate-500 hover:bg-slate-100">✕</button>
        </div>

        {error && <div role="alert" className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

        <form onSubmit={submit} noValidate className="grid gap-4 sm:grid-cols-[1fr_180px]">
          <div className="space-y-4">
            <FormField label="Name" name="name" value={form.name} onChange={change} error={errors.name} />
            <div>
              <label htmlFor="category" className="mb-1 block text-sm font-medium text-slate-700">Category</label>
              <select id="category" name="category" value={form.category} onChange={change} aria-invalid={Boolean(errors.category)} className={`w-full rounded-md border px-3 py-2 text-sm ${errors.category ? 'border-red-400' : 'border-slate-300'}`}>
                <option value="">Choose…</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              {errors.category && <p className="mt-1 text-xs text-red-600">{[].concat(errors.category).join(' ')}</p>}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <FormField label="Price (৳)" name="price" type="number" min="1" step="1" value={form.price} onChange={change} error={errors.price} />
              <FormField label="Stock" name="stock_quantity" type="number" min="0" step="1" value={form.stock_quantity} onChange={change} error={errors.stock_quantity} />
            </div>
            <div>
              <label htmlFor="description" className="mb-1 block text-sm font-medium text-slate-700">Description</label>
              <textarea id="description" name="description" rows={3} value={form.description} onChange={change} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
            </div>
            <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
              <input type="checkbox" name="is_available" checked={form.is_available} onChange={change} className="h-4 w-4 accent-brand-700" />
              Available for sale
            </label>
          </div>

          <div>
            <span className="mb-1 block text-sm font-medium text-slate-700">Image</span>
            <div className="aspect-square overflow-hidden rounded-2xl border border-dashed border-slate-300 bg-slate-50">
              {preview ? <img src={preview} alt="Preview" className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center text-xs text-slate-400">No image</div>}
            </div>
            <label className="mt-2 block cursor-pointer rounded-full border border-slate-300 px-3 py-2 text-center text-sm font-semibold text-slate-700 hover:bg-slate-50">
              {preview ? 'Change image' : 'Upload image'}
              <input type="file" accept="image/*" onChange={pickImage} className="sr-only" aria-label="Product image" />
            </label>
            {errors.image && <p className="mt-1 text-xs text-red-600">{[].concat(errors.image).join(' ')}</p>}
          </div>

          <div className="flex justify-end gap-2 sm:col-span-2">
            <button type="button" onClick={onClose} className="rounded-full px-5 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-100">Cancel</button>
            <button type="submit" disabled={saving} className="rounded-full bg-brand-700 px-6 py-2.5 text-sm font-semibold text-white hover:bg-brand-800 disabled:opacity-60">
              {saving ? 'Saving…' : product ? 'Save changes' : 'Create product'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
