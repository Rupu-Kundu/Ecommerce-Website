// Small shared pieces for the admin customer pages.

export function Avatar({ name, size = 'h-9 w-9 text-sm' }) {
  return (
    <span className={`flex shrink-0 items-center justify-center rounded-full bg-brand-100 font-bold text-brand-800 ${size}`} aria-hidden="true">
      {(name || '?').charAt(0).toUpperCase()}
    </span>
  )
}

export function ActiveBadge({ active }) {
  return active ? (
    <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden="true" />Active
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-600">
      <span className="h-1.5 w-1.5 rounded-full bg-slate-400" aria-hidden="true" />Inactive
    </span>
  )
}
