import { useEffect, useState } from 'react'
import FormField from '../../components/FormField'
import { createProduct, deleteProductImage, updateProduct, uploadProductImage } from '../../services/adminService'
import { getErrorMessage } from '../../services/api'

const EMPTY = { name: '', brand: '', category: '', price: '', stock_quantity: '0', description: '', is_available: true }
const MAX_GALLERY = 8

/** Create / edit a product in a dialog. `product` = null for a new product. */
export default function AdminProductForm({ product, categories, onClose, onSaved }) {
  const [form, setForm] = useState(() =>
    product
      ? {
          name: product.name,
          brand: product.brand || '',
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
  // Product details table rows
  const [specs, setSpecs] = useState(() => (product?.specifications?.length ? product.specifications : [{ label: '', value: '' }]))
  // Gallery: saved photos (existing product) + photos waiting to upload (new product)
  const [gallery, setGallery] = useState(product?.images || [])
  const [pending, setPending] = useState([]) // [{file, url}]
  const [galleryBusy, setGalleryBusy] = useState(false)
  const [galleryError, setGalleryError] = useState('')

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

  function setSpec(i, key, value) {
    setSpecs((rows) => rows.map((r, j) => (j === i ? { ...r, [key]: value } : r)))
  }

  async function addGalleryPhotos(e) {
    const files = Array.from(e.target.files || [])
    e.target.value = ''
    if (!files.length) return
    setGalleryError('')
    if (gallery.length + pending.length + files.length > MAX_GALLERY) {
      setGalleryError(`Up to ${MAX_GALLERY} extra photos.`)
      return
    }
    if (!product) {
      setPending((p) => [...p, ...files.map((file) => ({ file, url: URL.createObjectURL(file) }))])
      return
    }
    setGalleryBusy(true)
    try {
      for (const file of files) {
        const photo = await uploadProductImage(product.id, file, form.name)
        setGallery((g) => [...g, photo])
      }
    } catch (err) {
      setGalleryError(getErrorMessage(err, 'Could not upload the photo.'))
    } finally {
      setGalleryBusy(false)
    }
  }

  async function removeGalleryPhoto(photo) {
    setGalleryError('')
    try {
      await deleteProductImage(product.id, photo.id)
      setGallery((g) => g.filter((x) => x.id !== photo.id))
    } catch (err) {
      setGalleryError(getErrorMessage(err, 'Could not remove the photo.'))
    }
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
      const specifications = specs.filter((r) => r.label.trim() && r.value.trim()).map((r) => ({ label: r.label.trim(), value: r.value.trim() }))
      const fields = { ...form, name: form.name.trim(), brand: form.brand.trim(), specifications, image }
      let saved = product ? await updateProduct(product.id, fields) : await createProduct(fields)
      if (!product && pending.length) {
        for (const p of pending) await uploadProductImage(saved.id, p.file, saved.name)
        saved = { ...saved, images: pending.map((p, i) => ({ id: `new-${i}`, image: p.url })) }
      }
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
            <FormField label="Brand (optional)" name="brand" value={form.brand} onChange={change} error={errors.brand} />
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

          {/* Extra photos */}
          <div className="sm:col-span-2">
            <span className="mb-1 block text-sm font-medium text-slate-700">More photos (gallery)</span>
            <div className="flex flex-wrap gap-2" data-testid="admin-gallery">
              {gallery.map((g) => (
                <div key={g.id} className="relative h-20 w-20 overflow-hidden rounded-lg border border-slate-200">
                  <img src={g.image} alt="" className="h-full w-full object-cover" />
                  <button type="button" onClick={() => removeGalleryPhoto(g)} aria-label="Remove photo" className="absolute right-1 top-1 h-6 w-6 rounded-full bg-white/90 text-xs font-bold text-red-600 shadow">✕</button>
                </div>
              ))}
              {pending.map((p, i) => (
                <div key={p.url} className="relative h-20 w-20 overflow-hidden rounded-lg border border-dashed border-brand-300">
                  <img src={p.url} alt="" className="h-full w-full object-cover" />
                  <button type="button" onClick={() => setPending((x) => x.filter((_, j) => j !== i))} aria-label="Remove photo" className="absolute right-1 top-1 h-6 w-6 rounded-full bg-white/90 text-xs font-bold text-red-600 shadow">✕</button>
                </div>
              ))}
              {gallery.length + pending.length < MAX_GALLERY && (
                <label className="flex h-20 w-20 cursor-pointer items-center justify-center rounded-lg border border-dashed border-slate-300 text-center text-xs font-semibold text-slate-600 hover:bg-slate-50">
                  {galleryBusy ? 'Uploading…' : '+ Add photo'}
                  <input type="file" accept="image/*" multiple onChange={addGalleryPhotos} className="sr-only" aria-label="Add gallery photos" disabled={galleryBusy} />
                </label>
              )}
            </div>
            {galleryError && <p className="mt-1 text-xs text-red-600">{galleryError}</p>}
            <p className="mt-1 text-xs text-slate-500">Customers can zoom into every photo. At least 2 photos per product is recommended.</p>
          </div>

          {/* Product details table */}
          <fieldset className="sm:col-span-2">
            <legend className="mb-1 text-sm font-medium text-slate-700">Product details (shown as a table)</legend>
            <div className="space-y-2">
              {specs.map((row, i) => (
                <div key={i} className="flex gap-2">
                  <input aria-label={`Detail ${i + 1} label`} placeholder="e.g. Material" value={row.label} maxLength={60} onChange={(e) => setSpec(i, 'label', e.target.value)} className="w-2/5 rounded-md border border-slate-300 px-3 py-2 text-sm" />
                  <input aria-label={`Detail ${i + 1} value`} placeholder="e.g. 100% cotton" value={row.value} maxLength={200} onChange={(e) => setSpec(i, 'value', e.target.value)} className="min-w-0 flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm" />
                  <button type="button" onClick={() => setSpecs((rows) => (rows.length > 1 ? rows.filter((_, j) => j !== i) : [{ label: '', value: '' }]))} aria-label={`Remove detail ${i + 1}`} className="rounded-md px-2 text-slate-400 hover:bg-slate-100 hover:text-red-600">✕</button>
                </div>
              ))}
            </div>
            {specs.length < 20 && (
              <button type="button" onClick={() => setSpecs((rows) => [...rows, { label: '', value: '' }])} className="mt-2 text-sm font-semibold text-brand-700 hover:underline">+ Add a detail</button>
            )}
            {errors.specifications && <p className="mt-1 text-xs text-red-600">{[].concat(errors.specifications).join(' ')}</p>}
          </fieldset>

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
