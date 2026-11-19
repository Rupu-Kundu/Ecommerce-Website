import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import ErrorMessage from '../components/ErrorMessage'
import Loader from '../components/Loader'
import useCart from '../context/useCart'
import { getErrorMessage } from '../services/api'
import { confirmPayment } from '../services/paymentService'
import { formatPrice } from '../utils/format'

const MAX_CHECKS = 6 // Stripe can take a few seconds to report the payment

/**
 * Return page after paying. The server verifies the payment with the provider
 * (the URL alone proves nothing) and only then places the order.
 * Refreshing this page is safe — confirmation is idempotent.
 */
export default function PaymentSuccessPage() {
  const [params] = useSearchParams()
  const sessionId = params.get('session_id')
  const { refreshCart } = useCart()
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!sessionId) return undefined
    let cancelled = false
    let timer

    async function check(attempt) {
      try {
        const data = await confirmPayment(sessionId)
        if (cancelled) return
        if (data.payment.status === 'pending' && attempt < MAX_CHECKS) {
          timer = setTimeout(() => check(attempt + 1), 2000)
          return
        }
        setResult(data)
        if (data.payment.status === 'succeeded') refreshCart().catch(() => {}) // cart is now empty
      } catch (err) {
        if (!cancelled) setError(getErrorMessage(err, 'Could not verify your payment.'))
      }
    }
    check(1)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [sessionId, refreshCart])

  if (!sessionId) return <ErrorMessage message="Missing payment reference." />
  if (error) return <ErrorMessage message={error} />
  if (!result) return <Loader label="Verifying your payment…" />

  const { payment, order, detail } = result
  const succeeded = payment.status === 'succeeded'

  return (
    <div className="mx-auto max-w-lg rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm" data-testid="payment-result">
      <div className={`mx-auto flex h-14 w-14 items-center justify-center rounded-full text-2xl ${succeeded ? 'bg-brand-100 text-brand-700' : 'bg-amber-100 text-amber-700'}`}>
        {succeeded ? '✓' : '!'}
      </div>
      <h1 className="mt-4 text-2xl font-extrabold tracking-tight text-slate-900">
        {succeeded ? 'Payment successful' : payment.status === 'pending' ? 'Payment processing' : 'Payment not completed'}
      </h1>
      <p className="mt-2 text-sm text-slate-600" data-testid="payment-detail">{detail}</p>

      <dl className="mx-auto mt-6 max-w-xs space-y-1.5 rounded-2xl bg-slate-50 p-4 text-left text-sm">
        <div className="flex justify-between"><dt className="text-slate-500">Order</dt><dd className="font-semibold">#{order.id}</dd></div>
        <div className="flex justify-between"><dt className="text-slate-500">Amount</dt><dd className="font-semibold">{formatPrice(order.total_amount)}</dd></div>
        <div className="flex justify-between"><dt className="text-slate-500">Status</dt><dd className="font-semibold">{order.status_label}</dd></div>
      </dl>

      <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
        <Link to={`/orders/${order.id}`} className="rounded-full bg-brand-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-800">
          View order
        </Link>
        <Link to="/products" className="rounded-full border border-slate-300 px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">
          Continue shopping
        </Link>
      </div>
    </div>
  )
}
