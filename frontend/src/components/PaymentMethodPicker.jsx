/** Brand marks for the payment methods (text based — no third-party logo files). */
export function PaymentMark({ code, size = 'md' }) {
  const box = size === 'sm' ? 'h-6 px-2 text-[11px]' : 'h-8 px-2.5 text-xs'
  if (code === 'bkash') {
    return <span className={`inline-flex items-center rounded-md bg-[#E2136E] font-extrabold tracking-tight text-white ${box}`}>bKash</span>
  }
  if (code === 'cod') {
    return (
      <span className={`inline-flex items-center gap-1 rounded-md bg-emerald-600 font-bold text-white ${box}`}>
        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <rect x="2.5" y="6" width="19" height="12" rx="2" /><circle cx="12" cy="12" r="2.5" />
        </svg>
        COD
      </span>
    )
  }
  if (code === 'nagad') {
    return <span className={`inline-flex items-center rounded-md bg-gradient-to-r from-[#EC1C24] to-[#F7941D] font-extrabold tracking-tight text-white ${box}`}>Nagad</span>
  }
  return (
    <span className={`inline-flex items-center gap-1 rounded-md bg-slate-900 font-bold text-white ${box}`}>
      <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <rect x="2.5" y="5" width="19" height="14" rx="2" /><path d="M2.5 10h19" />
      </svg>
      Card
    </span>
  )
}

const DESCRIPTIONS = {
  card: 'Visa, Mastercard, Amex — secure Stripe checkout',
  bkash: 'Pay from your bKash wallet',
  nagad: 'Pay from your Nagad wallet',
  cod: 'Cash on delivery — pay the rider when your order arrives',
}

/**
 * Radio list of payment methods from GET /api/payments/config/.
 * methods: [{code, label, available, demo}]
 */
export default function PaymentMethodPicker({ methods, value, onChange }) {
  return (
    <fieldset className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-2 lg:grid-cols-4">
      <legend className="sr-only">Choose a payment method</legend>
      {methods.map((m) => (
        <label
          key={m.code}
          className={`relative flex cursor-pointer flex-col gap-2 rounded-xl border p-3 transition has-checked:border-brand-500 has-checked:bg-brand-50 has-checked:ring-2 has-checked:ring-brand-100 ${
            m.available ? 'border-slate-200 hover:border-slate-300' : 'cursor-not-allowed border-slate-100 opacity-50'
          }`}
        >
          <span className="flex items-center justify-between">
            <PaymentMark code={m.code} />
            <input
              type="radio"
              name="payment_method"
              value={m.code}
              checked={value === m.code}
              disabled={!m.available}
              onChange={() => onChange(m.code)}
              aria-label={`Pay with ${m.label}`}
              className="accent-brand-700"
            />
          </span>
          <span className="text-xs leading-snug text-slate-600">
            {m.available ? DESCRIPTIONS[m.code] : 'Not available right now'}
          </span>
          {m.available && m.demo && (
            <span className="w-fit rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-800">
              Test mode
            </span>
          )}
        </label>
      ))}
    </fieldset>
  )
}
