import { useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'

/**
 * List filters kept in the URL (so they survive refresh and can be shared).
 *
 *   const f = useUrlFilters(['search', 'status'])
 *   f.values.status          → '' when not set
 *   f.page                   → 1-based page number
 *   f.update({ status: 'x' })            (resets to page 1)
 *   f.update({ page: '3' }, { resetPage: false })
 *
 * React Router applies URL changes in a transition, so two quick changes could each start
 * from the old URL and undo each other. Every change is built on the newest URL asked for.
 */
export default function useUrlFilters(keys) {
  const [params, setParams] = useSearchParams()
  const pending = useRef(null)

  useEffect(() => {
    pending.current = null // the router caught up
  }, [params])

  const values = Object.fromEntries(keys.map((k) => [k, params.get(k) || '']))
  const page = Math.max(1, Number(params.get('page')) || 1)

  function update(changes, { resetPage = true } = {}) {
    const next = new URLSearchParams(pending.current ?? params)
    Object.entries(changes).forEach(([k, v]) => (v ? next.set(k, String(v)) : next.delete(k)))
    if (resetPage) next.delete('page')
    pending.current = next
    setParams(next, { replace: true })
  }

  return { values, page, update, params }
}
