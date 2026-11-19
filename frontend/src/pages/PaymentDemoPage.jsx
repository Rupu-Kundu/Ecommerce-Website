import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import ErrorMessage from '../components/ErrorMessage'
import Loader from '../components/Loader'
import Logo from '../components/Logo'
import { getErrorMessage } from '../services/api'
import { getOrder } from '../services/orderService'
import { cancelPayment, completeDemoPayment } from '../services/paymentService'
import { formatPrice } from '../utils/format'

/**
 * Demo test payment gateway (used while no Stripe key is configured).
 * It simulates a hosted payment page — no card details are asked for or stored.
 */
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

  const awaitingPayment = order.payment_status === 'pending'

  return (
    <div className="mx-auto max-w-md">
      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-xl shadow-slate-900/5">
        <div className="flex items-center justify-between bg-slate-900 px-6 py-4 text-white">
          <Logo variant="light" />
          <span className="rounded-full bg-accent-400 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-slate-900">
            Test mode
          </span>
        </div>

        <div className="p-6">
          <p className="text-sm text-slate-500">Demo payment for order #{order.id}</p>
          <p className="mt-1 text-4xl font-extrabold tracking-tight text-slate-900" data-testid="demo-amount">
            {formatPrice(order.total_amount)}
          </p>
          <dl className="mt-5 space-y-1.5 border-t border-slate-100 pt-4 text-sm">
            <div className="flex justify-between"><dt className="text-slate-500">Items ({order.item_count})</dt><dd>{formatPrice(order.subtotal)}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">{order.shipping_method_label}</dt><dd>{Number(order.shipping_cost) === 0 ? 'Free' : formatPrice(order.shipping_cost)}</dd></div>
          </dl>

          <div className="mt-5 rounded-xl bg-amber-50 p-3 text-xs leading-relaxed text-amber-900">
            This is a <strong>simulated</strong> payment page for testing. No card details are needed and no money
            is charged. Add your Stripe test keys to <code>.env</code> to use real Stripe test mode instead.
          </div>

          {error && <p role="alert" className="mt-4 text-sm text-red-600">{error}</p>}

          {awaitingPayment ? (
            <div className="mt-6 space-y-2">
              <button
                type="button"
                onClick={() => finish('success')}
                disabled={busy !== null}
                className="w-full rounded-full bg-brand-700 px-4 py-3 text-sm font-semibold text-white transition hover:bg-brand-800 disabled:opacity-60"
              >
                {busy === 'success' ? 'Processing…' : `Pay ${formatPrice(order.total_amount)}`}
              </button>
              <button
                type="button"
                onClick={() => finish('failure')}
                disabled={busy !== null}
                className="w-full rounded-full border border-red-200 px-4 py-3 text-sm font-semibold text-red-700 transition hover:bg-red-50 disabled:opacity-60"
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
