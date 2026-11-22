import { useEffect, useRef, useState } from 'react'

// One series over time: 2px line + 10% area wash, hairline grid, one y-axis.
// Hover/keyboard: a crosshair snaps to the nearest day and a tooltip shows the values.
const COLOR = '#05906b' // brand-600 — passes the palette validator on white
const HEIGHT = 260
const M = { top: 12, right: 16, bottom: 28, left: 56 }

function niceMax(max) {
  if (max <= 0) return 4
  const pow = 10 ** Math.floor(Math.log10(max))
  const step = [1, 2, 2.5, 5, 10].map((s) => s * pow).find((s) => max / s <= 4) || 10 * pow
  return Math.ceil(max / step) * step
}

/**
 * points: [{date: '2026-11-22', value: number, ...extra}]
 * formatValue(n) for the tooltip, formatAxis(n) for y ticks, formatDate(iso) for x ticks.
 * tooltipRows(point) → [{label, value}] extra lines shown under the main value.
 */
export default function TrendChart({ points, label, formatValue, formatAxis, formatDate, tooltipRows, emptyText }) {
  const wrapRef = useRef(null)
  const [width, setWidth] = useState(640)
  const [active, setActive] = useState(null)

  useEffect(() => {
    const el = wrapRef.current
    if (!el || typeof ResizeObserver === 'undefined') return undefined
    const ro = new ResizeObserver(([entry]) => setWidth(Math.max(280, Math.floor(entry.contentRect.width))))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const max = Math.max(0, ...points.map((p) => p.value))
  const yMax = niceMax(max)
  const innerW = width - M.left - M.right
  const innerH = HEIGHT - M.top - M.bottom
  const x = (i) => M.left + (points.length <= 1 ? innerW / 2 : (i / (points.length - 1)) * innerW)
  const y = (v) => M.top + innerH - (v / yMax) * innerH
  const empty = max === 0

  const coords = points.map((p, i) => [x(i), y(p.value)])
  const line = coords.map(([cx, cy], i) => `${i ? 'L' : 'M'}${cx.toFixed(1)},${cy.toFixed(1)}`).join('')
  const area = coords.length ? `${line}L${coords[coords.length - 1][0].toFixed(1)},${M.top + innerH}L${coords[0][0].toFixed(1)},${M.top + innerH}Z` : ''

  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => yMax * f)
  const xTickCount = width < 480 ? 4 : 7
  const xTicks = points.length <= 1 ? [0] : Array.from(new Set(Array.from({ length: xTickCount }, (_, k) => Math.round((k / (xTickCount - 1)) * (points.length - 1)))))

  function indexFromPointer(e) {
    const rect = e.currentTarget.getBoundingClientRect()
    const px = ((e.clientX - rect.left) / rect.width) * width
    const i = Math.round(((px - M.left) / innerW) * (points.length - 1))
    return Math.max(0, Math.min(points.length - 1, i))
  }

  function onKeyDown(e) {
    if (!points.length) return
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault()
      const step = e.key === 'ArrowRight' ? 1 : -1
      setActive((a) => Math.max(0, Math.min(points.length - 1, (a ?? points.length - 1) + step)))
    } else if (e.key === 'Home') setActive(0)
    else if (e.key === 'End') setActive(points.length - 1)
    else if (e.key === 'Escape') setActive(null)
  }

  const p = active != null ? points[active] : null
  const tipLeft = p ? Math.min(Math.max(x(active), 90), width - 90) : 0
  const total = points.reduce((s, q) => s + q.value, 0)

  return (
    <div ref={wrapRef} className="relative w-full select-none" data-testid="trend-chart">
      <svg
        width={width}
        height={HEIGHT}
        viewBox={`0 0 ${width} ${HEIGHT}`}
        role="img"
        tabIndex={0}
        aria-label={`${label}: ${points.length} days, total ${formatValue(total)}. Use the left and right arrow keys to read each day.`}
        className="block max-w-full rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
        onPointerMove={(e) => setActive(indexFromPointer(e))}
        onPointerLeave={() => setActive(null)}
        onFocus={() => setActive((a) => a ?? points.length - 1)}
        onBlur={() => setActive(null)}
        onKeyDown={onKeyDown}
      >
        {/* grid + y axis */}
        {yTicks.map((t) => (
          <g key={t}>
            <line x1={M.left} x2={width - M.right} y1={y(t)} y2={y(t)} stroke="#e2e8f0" strokeWidth="1" />
            <text x={M.left - 8} y={y(t)} dy="0.32em" textAnchor="end" className="fill-slate-500 text-[11px] tabular-nums">
              {formatAxis(t)}
            </text>
          </g>
        ))}
        {/* x axis labels */}
        {xTicks.map((i) => (
          <text key={i} x={x(i)} y={HEIGHT - 8} textAnchor={i === 0 ? 'start' : i === points.length - 1 ? 'end' : 'middle'} className="fill-slate-500 text-[11px]">
            {formatDate(points[i].date)}
          </text>
        ))}
        {!empty && (
          <>
            <path d={area} fill={COLOR} fillOpacity="0.1" />
            <path d={line} fill="none" stroke={COLOR} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
          </>
        )}
        {empty && <line x1={M.left} x2={width - M.right} y1={y(0)} y2={y(0)} stroke={COLOR} strokeWidth="2" strokeOpacity="0.35" />}
        {/* crosshair */}
        {p && (
          <g pointerEvents="none">
            <line x1={x(active)} x2={x(active)} y1={M.top} y2={M.top + innerH} stroke="#94a3b8" strokeWidth="1" />
            <circle cx={x(active)} cy={y(p.value)} r="5" fill={COLOR} stroke="#ffffff" strokeWidth="2" />
          </g>
        )}
      </svg>

      {empty && (
        <p className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 text-center text-sm text-slate-500">
          {emptyText}
        </p>
      )}

      {p && (
        <div
          className="pointer-events-none absolute top-2 z-10 w-44 -translate-x-1/2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs shadow-lg"
          style={{ left: tipLeft }}
          role="status"
          data-testid="chart-tooltip"
        >
          <p className="text-base font-bold tabular-nums text-slate-900">{formatValue(p.value)}</p>
          <p className="flex items-center gap-1.5 text-slate-600">
            <span className="h-0.5 w-3 rounded-full" style={{ background: COLOR }} aria-hidden="true" />
            {label} · {formatDate(p.date)}
          </p>
          {tooltipRows?.(p).map((r) => (
            <p key={r.label} className="mt-0.5 text-slate-500">
              <span className="font-semibold text-slate-700">{r.value}</span> {r.label}
            </p>
          ))}
        </div>
      )}
    </div>
  )
}
