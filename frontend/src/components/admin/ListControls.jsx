import { useEffect, useState } from 'react'
import { cardClass, controlClass } from './styles'

// Shared building blocks for the admin list pages (payments, products, categories, orders).

/** Search box that reports changes after the user pauses typing (one request per word, not per key). */
export function SearchBox({ id, label, value, onSearch, placeholder, delay = 300 }) {
  const [text, setText] = useState(value)
  const [synced, setSynced] = useState(value)
  if (value !== synced) {
    // changed from outside (back button, "Clear filters")
    setSynced(value)
    setText(value)
  }
  useEffect(() => {
    if (text.trim() === value) return undefined
    const t = setTimeout(() => {
      setSynced(text.trim())
      onSearch(text.trim())
    }, delay)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text])
  return (
    <div className="relative">
      <label htmlFor={id} className="sr-only">{label}</label>
      <svg viewBox="0 0 24 24" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" />
      </svg>
      <input
        id={id}
        type="search"
        value={text}
        maxLength={100}
        onChange={(e) => setText(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-xl border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm text-slate-700 focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-100"
      />
    </div>
  )
}

/** A labelled <select>; options = [[value, text], ...]. */
export function FilterSelect({ id, label, value, onChange, options }) {
  return (
    <div>
      <label htmlFor={id} className="sr-only">{label}</label>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className={controlClass}>
        {options.map(([v, text]) => <option key={v} value={v}>{text}</option>)}
      </select>
    </div>
  )
}

export function SummaryChip({ label, value, note, tone = 'slate', testId, onClick, active }) {
  const tones = { slate: 'text-slate-900', green: 'text-emerald-700', amber: 'text-amber-700', red: 'text-red-700', sky: 'text-sky-700' }
  const body = (
    <>
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className={`text-xl font-bold ${tones[tone]}`} data-testid={testId}>{value}</p>
      {note && <p className="text-[11px] text-slate-500">{note}</p>}
    </>
  )
  if (onClick) {
    return (
      <button type="button" onClick={onClick} aria-pressed={Boolean(active)} className={`${cardClass} px-4 py-3 text-left transition hover:border-brand-300 ${active ? 'border-brand-500 ring-2 ring-brand-100' : ''}`}>
        {body}
      </button>
    )
  }
  return <div className={`${cardClass} px-4 py-3`}>{body}</div>
}

export function ListSkeleton({ rows = 6, label = 'Loading' }) {
  return (
    <div className="divide-y divide-slate-100" aria-label={label} aria-busy="true">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3 px-5 py-4">
          <span className="h-9 w-9 animate-pulse rounded-lg bg-slate-200" />
          <span className="h-4 flex-1 animate-pulse rounded bg-slate-200" />
          <span className="hidden h-4 w-24 animate-pulse rounded bg-slate-200 sm:block" />
        </div>
      ))}
    </div>
  )
}

export function EmptyState({ title, hint, testId, children }) {
  return (
    <div className="px-5 py-14 text-center" data-testid={testId}>
      <p className="font-semibold text-slate-900">{title}</p>
      {hint && <p className="mt-1 text-sm text-slate-500">{hint}</p>}
      {children && <div className="mt-4">{children}</div>}
    </div>
  )
}

/** Shown above a list when a refresh failed but older data is still on screen. */
export function ErrorBanner({ message, onRetry }) {
  return (
    <div role="alert" className="m-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
      {message}
      {onRetry && <button type="button" onClick={onRetry} className="font-semibold underline">Try again</button>}
    </div>
  )
}
