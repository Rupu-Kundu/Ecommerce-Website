import { useCallback, useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import useAuth from '../../context/useAuth'
import { getErrorMessage } from '../../services/api'
import { deleteReview, getReviews, saveReview } from '../../services/productService'
import { formatDate } from '../../utils/format'
import StarRating, { StarInput } from './StarRating'

/** Ratings summary, the customer's own review form, and the list of reviews. */
export default function ProductReviews({ productId, onSummaryChange }) {
  const { user, isAuthenticated } = useAuth()
  const location = useLocation()
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState(false)
  const [rating, setRating] = useState(0)
  const [comment, setComment] = useState('')
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')

  const [reloadKey, setReloadKey] = useState(0)
  const load = useCallback(() => setReloadKey((k) => k + 1), [])

  useEffect(() => {
    let cancelled = false
    getReviews(productId)
      .then((d) => {
        if (cancelled) return
        setData(d)
        setError('')
        onSummaryChange?.(d.summary)
      })
      .catch((err) => !cancelled && setError(getErrorMessage(err, 'Could not load reviews.')))
    return () => {
      cancelled = true
    }
  }, [productId, onSummaryChange, user?.id, reloadKey])

  function startEdit() {
    setRating(data.my_review?.rating || 0)
    setComment(data.my_review?.comment || '')
    setFormError('')
    setEditing(true)
  }

  async function submit(e) {
    e.preventDefault()
    if (!rating) {
      setFormError('Please choose 1 to 5 stars.')
      return
    }
    setSaving(true)
    setFormError('')
    try {
      await saveReview(productId, { rating, comment: comment.trim() })
      setEditing(false)
      load()
    } catch (err) {
      setFormError(getErrorMessage(err, 'Could not save your review.'))
    } finally {
      setSaving(false)
    }
  }

  async function remove(reviewId) {
    if (!window.confirm('Delete this review?')) return
    try {
      await deleteReview(productId, reviewId)
      load()
    } catch (err) {
      setError(getErrorMessage(err, 'Could not delete the review.'))
    }
  }

  if (error && !data) return <p className="text-sm text-red-600">{error}</p>
  if (!data) return <p className="text-sm text-slate-500">Loading reviews…</p>

  const { summary, my_review: mine, results } = data
  const max = Math.max(1, ...Object.values(summary.distribution))

  return (
    <div className="grid gap-8 md:grid-cols-3">
      {/* Summary */}
      <div className="space-y-4" data-testid="review-summary">
        <div className="flex items-end gap-3">
          <span className="text-5xl font-extrabold text-slate-900" data-testid="average-rating">
            {summary.average != null ? summary.average.toFixed(1) : '–'}
          </span>
          <div className="pb-1">
            <StarRating value={summary.average} size="md" />
            <p className="text-sm text-slate-500" data-testid="rating-count">
              {summary.count} {summary.count === 1 ? 'rating' : 'ratings'}
            </p>
          </div>
        </div>
        <ul className="space-y-1.5" aria-label="Ratings breakdown">
          {['5', '4', '3', '2', '1'].map((stars) => (
            <li key={stars} className="flex items-center gap-2 text-sm">
              <span className="w-10 text-slate-600">{stars} ★</span>
              <span className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                <span className="block h-full rounded-full bg-amber-400" style={{ width: `${(summary.distribution[stars] / max) * 100}%` }} />
              </span>
              <span className="w-6 text-right tabular-nums text-slate-500">{summary.distribution[stars]}</span>
            </li>
          ))}
        </ul>

        {/* Your review */}
        {!isAuthenticated ? (
          <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-600">
            <Link to="/login" state={{ from: location }} className="font-semibold text-brand-700 hover:underline">Log in</Link> to rate this product.
          </p>
        ) : editing ? (
          <form onSubmit={submit} className="space-y-3 rounded-xl border border-slate-200 p-4" aria-label="Your review">
            <StarInput value={rating} onChange={setRating} />
            <label htmlFor="review-comment" className="sr-only">Your review (optional)</label>
            <textarea
              id="review-comment"
              rows={3}
              maxLength={1000}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="What did you like or dislike? (optional)"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100"
            />
            {formError && <p role="alert" className="text-sm text-red-600">{formError}</p>}
            <div className="flex gap-2">
              <button type="submit" disabled={saving} className="rounded-full bg-brand-700 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-800 disabled:opacity-60">
                {saving ? 'Saving…' : mine ? 'Update review' : 'Submit review'}
              </button>
              <button type="button" onClick={() => setEditing(false)} className="rounded-full px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100">Cancel</button>
            </div>
          </form>
        ) : (
          <button type="button" onClick={startEdit} className="w-full rounded-full border-2 border-brand-700 px-4 py-2 text-sm font-semibold text-brand-700 hover:bg-brand-50">
            {mine ? 'Edit your review' : 'Write a review'}
          </button>
        )}
      </div>

      {/* List */}
      <div className="md:col-span-2">
        {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
        {results.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-slate-500">No reviews yet — be the first to rate this product.</p>
        ) : (
          <ul className="divide-y divide-slate-100" data-testid="review-list">
            {results.map((r) => (
              <li key={r.id} className="py-4" data-testid="review">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <StarRating value={r.rating} />
                  <span className="text-sm font-semibold text-slate-900">{r.author}</span>
                  {r.verified_purchase && (
                    <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">✓ Verified purchase</span>
                  )}
                  <span className="text-xs text-slate-400">{formatDate(r.created_at)}</span>
                  {(r.is_mine || user?.role === 'admin') && (
                    <button type="button" onClick={() => remove(r.id)} className="ml-auto text-xs font-medium text-red-600 hover:underline">
                      Delete
                    </button>
                  )}
                </div>
                {r.comment && <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-slate-700">{r.comment}</p>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
