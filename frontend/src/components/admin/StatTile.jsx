import { Link } from 'react-router-dom'
import AdminIcon from './AdminIcon'

/**
 * Change vs the previous period. Up is good for every KPI on this dashboard,
 * so ▲ is green and ▼ is red. Shown with an arrow + sign, never colour alone.
 */
export function DeltaBadge({ change, current, previousLabel }) {
  let text
  let tone
  let arrow = ''
  if (change == null) {
    // Nothing in the previous period to compare with.
    text = Number(current) > 0 ? 'New' : 'No change'
    tone = Number(current) > 0 ? 'bg-sky-50 text-sky-700' : 'bg-slate-100 text-slate-500'
  } else if (change > 0) {
    text = `+${change.toLocaleString('en-US')}%`
    tone = 'bg-emerald-50 text-emerald-700'
    arrow = '▲'
  } else if (change < 0) {
    text = `${change.toLocaleString('en-US')}%`
    tone = 'bg-red-50 text-red-700'
    arrow = '▼'
  } else {
    text = '0%'
    tone = 'bg-slate-100 text-slate-500'
  }
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5 text-xs" data-testid="delta">
      <span className={`inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 font-semibold ${tone}`}>
        {arrow && <span aria-hidden="true">{arrow}</span>}
        {text}
      </span>
      <span className="text-slate-500">vs {previousLabel}</span>
    </span>
  )
}

/** KPI tile: label, big value, change vs the previous period, optional note and link. */
export default function StatTile({ label, value, icon, change, current, previousLabel, note, to, testId }) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-slate-500">{label}</p>
        {icon && (
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
            <AdminIcon name={icon} className="h-5 w-5" />
          </span>
        )}
      </div>
      <p className="mt-1 text-3xl font-bold tracking-tight text-slate-900" data-testid={testId}>{value}</p>
      <div className="mt-2 space-y-1">
        <DeltaBadge change={change} current={current} previousLabel={previousLabel} />
        {note && <p className="text-xs text-slate-500">{note}</p>}
      </div>
    </>
  )
  const cls = 'block rounded-2xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-900/[0.03]'
  return to ? (
    <Link to={to} className={`${cls} transition hover:border-brand-300 hover:shadow-md`}>{body}</Link>
  ) : (
    <div className={cls}>{body}</div>
  )
}
