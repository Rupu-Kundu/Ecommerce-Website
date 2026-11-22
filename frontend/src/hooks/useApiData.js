import { useEffect, useState } from 'react'
import { getErrorMessage } from '../services/api'

/**
 * Load data for a key (e.g. the JSON of the current filters).
 *   const { data, error, loading, reload } = useApiData(key, () => getThings(filters), 'Could not load things.')
 *
 * - `data` keeps the last successful result while a new key loads (show it dimmed — no layout jump).
 * - `loading` is true until the request for the current key has finished.
 * - `error` is the message of the last failed request (cleared on success).
 * - `onError(err)` may return true to handle an error itself (e.g. go back to page 1 on a 404).
 */
export default function useApiData(key, fetcher, fallbackMessage, onError) {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [reloadKey, setReloadKey] = useState(0)
  const requestKey = `${key}#${reloadKey}`
  const [settledKey, setSettledKey] = useState(null)

  useEffect(() => {
    let cancelled = false
    const thisKey = `${key}#${reloadKey}`
    fetcher()
      .then((d) => {
        if (cancelled) return
        setData(d)
        setError('')
      })
      .catch((err) => {
        if (cancelled || onError?.(err)) return
        setError(getErrorMessage(err, fallbackMessage))
      })
      .finally(() => !cancelled && setSettledKey(thisKey))
    return () => {
      cancelled = true
    }
    // The fetcher changes every render; `key` says when to load again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, reloadKey])

  return {
    data,
    setData,
    error,
    loading: settledKey !== requestKey,
    reload: () => setReloadKey((k) => k + 1),
  }
}
