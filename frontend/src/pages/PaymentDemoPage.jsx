import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import ErrorMessage from '../components/ErrorMessage'
import Loader from '../components/Loader'
import { PaymentMark } from '../components/PaymentMethodPicker'
import { getErrorMessage } from '../services/api'
import { getOrder } from '../services/orderService'
import { cancelPayment, completeDemoPayment } from '../services/paymentService'
import { formatPrice } from '../utils/format'

// Simulated payment pages for testing without merchant accounts.
// Wallet number / OTP / PIN entered here stay in the browser — they are NEVER sent anywhere.
const DEMO_OTP = '123456'
const THEME = {
  card: { header: 'bg-slate-900', button: 'bg-brand-700 hover:bg-brand-800', ring: 'focus:ring-brand-100 focus:border-brand-500' },
  bkash: { header: 'bg-[#E2136E]', button: 'bg-[#E2136E] hover:bg-[#c50f5f]', ring: 'focus:ring-pink-100 focus:border-[#E2136E]' },
  nagad: { header: 'bg-gradient-to-r from-[#EC1C24] to-[#F7941D]', button: 'bg-[#EC1C24] hover:bg-[#cf161d]', ring: 'focus:ring-orange-100 focus:border-[#F7941D]' },
}
const PIN_LENGTH = { bkash: 5, nagad: 4 }

function WalletSteps({ method, label, theme, amount, busy, onPay }) {
  const [step, setStep] = useState('number') // number → otp → pin
  const [number, setNumber] = useState('')
  const [otp, setOtp] = useState('')
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const pinLength = PIN_LENGTH[method]
  const input = `w-full rounded-xl border border-slate-300 px-4 py-3 text-center text-lg tracking-widest outline-none focus:ring-4 ${theme.ring}`

  function next(event) {
    event.preventDefault()
    setError('')
    if (step === 'number') {
      if (!/^01[3-9]\d{8}$/.test(number)) return setError(`Enter your 11-digit ${label} number (e.g. 01712345678).`)
      return setStep('otp')
    }
    if (step === 'otp') {
      if (otp !== DEMO_OTP) return setError('Wrong verification code.')
      return setStep('pin')
    }
    if (!new RegExp(`^\\d{${pinLength}}$`).test(pin)) return setError(`Enter your ${pinLength}-digit ${label} PIN.`)
    onPay()
  }

  return (
    <form onSubmit={next} noValidate className="mt-5 space-y-3" aria-label={`${label} payment`}>
      <ol className="flex justify-between text-[11px] font-semibold uppercase tracking-wide text-slate-400">
        {['number', 'otp', 'pin'].map((s, i) => (
          <li key={s} className={step === s ? 'text-slate-900' : ''}>{i + 1}. {s === 'number' ? 'Account' : s === 'otp' ? 'Verify' : 'PIN'}</li>
        ))}
      </ol>
      {step === 'number' && (
        <>
          <label htmlFor="wallet-number" className="block text-sm font-medium text-slate-700">Your {label} account number</label>
          <input id="wallet-number" inputMode="numeric" autoComplete="off" placeholder="01XXXXXXXXX" maxLength={11} value={number} onChange={(e) => setNumber(e.target.value.replace(/\D/g, ''))} className={input} />
        </>
      )}
      {step === 'otp' && (
        <>
          <label htmlFor="wallet-otp" className="block text-sm font-medium text-slate-700">Verification code sent to {number}</label>
          <input id="wallet-otp" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))} className={input} />
          <p className="text-xs text-slate-500">Demo code: <strong>{DEMO_OTP}</strong></p>
        </>
      )}
      {step === 'pin' && (
        <>
          <label htmlFor="wallet-pin" className="block text-sm font-medium text-slate-700">Enter your {label} PIN</label>
          <input id="wallet-pin" type="password" inputMode="numeric" autoComplete="off" maxLength={pinLength} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} className={input} />
          <p className="text-xs text-slate-500">Demo: any {pinLength} digits.</p>
        </>
      )}
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      <button type="submit" disabled={busy !== null} className={`w-full rounded-full px-4 py-3 text-sm font-semibold text-white transition disabled:opacity-60 ${theme.button}`}>
        {busy === 'success' ? 'Processing…' : step === 'pin' ? `Confirm ${formatPrice(amount)}` : 'Next'}
      </button>
    </form>
  )
}

export default function PaymentDemoPage() {
  const [params] = useSearchParams()
  const sessionId = params.get('session_id')
  const orderId = params.get('order')
  const navigate = useNavigate()

  const [order, setOrder] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(null) // 'success' | 'failure' | 'cancel'

  useEffect(() => {
    let cancelled = false
    getOrder(orderId)
      .then((data) => !cancelled && setOrder(data))
      .catch((err) => !cancelled && setError(getErrorMessage(err, 'Could not load this payment.')))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [orderId])

  async function finish(outcome) {
    setBusy(outcome)
    setError('')
    try {
      if (outcome === 'cancel') {
        await cancelPayment(order.id)
        navigate(`/payment/cancel?order=${order.id}`, { replace: true })
        return
      }
      const result = await completeDemoPayment(sessionId, outcome)
      if (result.payment.status === 'succeeded' || result.payment.status === 'refunded') {
        navigate(`/payment/success?session_id=${encodeURIComponent(sessionId)}`, { replace: true })
      } else {
        navigate(`/payment/cancel?order=${order.id}`, { replace: true })
      }
    } catch (err) {
      setError(getErrorMessage(err, 'Payment could not be completed.'))
      setBusy(null)
    }
  }

  if (!sessionId || !orderId) return <ErrorMessage message="This payment link is incomplete." />
  if (loading) return <Loader label="Loading payment…" />
  if (!order) return <ErrorMessage message={error} />

  const method = order.payment_method || 'card'
  const label = order.payment_method_label || 'Card'
  const theme = THEME[method] || THEME.card
  const awaitingPayment = order.payment_status === 'pending'

  return (
    <div className="mx-auto max-w-md">
      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-xl shadow-slate-900/5" data-testid={`demo-${method}`}>
        <div className={`flex items-center justify-between px-6 py-4 text-white ${theme.header}`}>
          <span className="flex items-center gap-2 text-lg font-extrabold tracking-tight">
            {method === 'card' ? <PaymentMark code="card" /> : label}
            <span className="text-sm font-medium opacity-90">Payment</span>
          </span>
          <span className="rounded-full bg-white/90 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-slate-900">Test mode</span>
        </div>

        <div className="p-6">
          <p className="text-sm text-slate-500">Haatbox · order #{order.id}</p>
          <p className="mt-1 text-4xl font-extrabold tracking-tight text-slate-900" data-testid="demo-amount">
            {formatPrice(order.total_amount)}
          </p>
          <dl className="mt-5 space-y-1.5 border-t border-slate-100 pt-4 text-sm">
            <div className="flex justify-between"><dt className="text-slate-500">Items ({order.item_count})</dt><dd>{formatPrice(order.subtotal)}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">{order.shipping_method_label}</dt><dd>{Number(order.shipping_cost) === 0 ? 'Free' : formatPrice(order.shipping_cost)}</dd></div>
          </dl>

          <div className="mt-5 rounded-xl bg-amber-50 p-3 text-xs leading-relaxed text-amber-900">
            <strong>Simulated</strong> {label} payment for testing — no money moves and nothing you type here is sent anywhere.
            Add your {method === 'card' ? 'Stripe' : label} merchant credentials to <code>backend/.env</code> to use the real {label} gateway.
          </div>

          {error && <p role="alert" className="mt-4 text-sm text-red-600">{error}</p>}

          {awaitingPayment ? (
            <>
              {method === 'card' ? (
                <button
                  type="button"
                  onClick={() => finish('success')}
                  disabled={busy !== null}
                  className={`mt-6 w-full rounded-full px-4 py-3 text-sm font-semibold text-white transition disabled:opacity-60 ${theme.button}`}
                >
                  {busy === 'success' ? 'Processing…' : `Pay ${formatPrice(order.total_amount)}`}
                </button>
              ) : (
                <WalletSteps method={method} label={label} theme={theme} amount={order.total_amount} busy={busy} onPay={() => finish('success')} />
              )}
              <div className="mt-2 space-y-1">
                <button
                  type="button"
                  onClick={() => finish('failure')}
                  disabled={busy !== null}
                  className="w-full rounded-full border border-red-200 px-4 py-2.5 text-sm font-semibold text-red-700 transition hover:bg-red-50 disabled:opacity-60"
                >
                  {busy === 'failure' ? 'Processing…' : 'Simulate a failed payment'}
                </button>
                <button
                  type="button"
                  onClick={() => finish('cancel')}
                  disabled={busy !== null}
                  className="w-full px-4 py-2 text-sm font-medium text-slate-500 hover:text-slate-800"
                >
                  Cancel and return to the shop
                </button>
              </div>
            </>
          ) : (
            <p className="mt-6 text-sm text-slate-600">
              This payment is already finished.{' '}
              <Link to={`/orders/${order.id}`} className="font-semibold text-brand-700 hover:underline">View order #{order.id}</Link>
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
