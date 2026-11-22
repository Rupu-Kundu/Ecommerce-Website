// Ranked horizontal bars in one hue (brand-600): name, bar, value at the tip.
// Every value is printed, so nothing depends on hovering; hovering a row just highlights it.
const COLOR = '#05906b'

/**
 * rows: [{key, label, value (number, sets the bar length), display (string shown), sub?}]
 * The bar track is the full row width; the longest bar fills it.
 */
export default function BarList({ rows, emptyText = 'No data for this period.', ariaLabel, testId }) {
  const max = Math.max(0, ...rows.map((r) => r.value))
  if (rows.length === 0 || max === 0) {
    return <p className="py-6 text-center text-sm text-slate-500" data-testid={testId}>{emptyText}</p>
  }
  return (
    <ul className="space-y-3" aria-label={ariaLabel} data-testid={testId}>
      {rows.map((r) => (
        <li key={r.key} className="group rounded-lg px-1 py-0.5 transition hover:bg-slate-50" title={`${r.label}: ${r.display}`}>
          <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0 truncate text-slate-700">{r.label}</span>
            <span className="shrink-0 font-semibold tabular-nums text-slate-900">
              {r.display}
              {r.sub && <span className="ml-1.5 font-normal text-slate-500">{r.sub}</span>}
            </span>
          </div>
          <div className="h-2 w-full rounded-full bg-slate-100" aria-hidden="true">
            {r.value > 0 && (
              <div
                className="h-2 rounded-full transition-[filter] group-hover:brightness-110"
                style={{ width: `${Math.max(2, (r.value / max) * 100)}%`, background: COLOR }}
              />
            )}
          </div>
        </li>
      ))}
    </ul>
  )
}
