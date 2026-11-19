/** − [n] + control. Calls onChange with the new quantity, clamped to [min, max]. */
export default function QuantityControl({ value, min = 1, max = 99, onChange, disabled = false, label = 'Quantity' }) {
  const button =
    'flex h-9 w-9 items-center justify-center text-lg font-medium text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40'

  return (
    <div className="inline-flex items-center overflow-hidden rounded-md border border-slate-300 bg-white" role="group" aria-label={label}>
      <button
        type="button"
        className={button}
        onClick={() => onChange(value - 1)}
        disabled={disabled || value <= min}
        aria-label="Decrease quantity"
      >
        −
      </button>
      <span className="w-10 text-center text-sm font-semibold tabular-nums" aria-live="polite" data-testid="quantity">
        {value}
      </span>
      <button
        type="button"
        className={button}
        onClick={() => onChange(value + 1)}
        disabled={disabled || value >= max}
        aria-label="Increase quantity"
      >
        +
      </button>
    </div>
  )
}
