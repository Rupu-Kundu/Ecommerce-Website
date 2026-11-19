export default function Pagination({ page, totalPages, onChange }) {
  if (totalPages <= 1) return null

  const button =
    'rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40'

  return (
    <nav aria-label="Pagination" className="mt-8 flex items-center justify-center gap-3">
      <button type="button" className={button} disabled={page <= 1} onClick={() => onChange(page - 1)}>
        Previous
      </button>
      <span className="text-sm text-slate-600">
        Page {page} of {totalPages}
      </span>
      <button type="button" className={button} disabled={page >= totalPages} onClick={() => onChange(page + 1)}>
        Next
      </button>
    </nav>
  )
}
