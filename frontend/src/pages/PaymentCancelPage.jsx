import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import ErrorMessage from '../components/ErrorMessage'
import Loader from '../components/Loader'
import { getErrorMessage } from '../services/api'
import { cancelPayment } from '../services/paymentService'

/**
 * Shown when a payment fails or the customer leaves the payment page.
 * The server marks the attempt as failed (safe to repeat); nothing is charged,
 * stock is untouched and the cart is kept so the customer can try again.
 */
export default function PaymentCancelPage() {
  const [params] = useSearchParams()
  const orderId = params.get('order')
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!orderId) return undefined
    let cancelled = false
    cancelPayment(orderId)
      .then((data) => !cancelled && setResult(data))
      .catch((err) => !cancelled && setError(getErrorMessage(err, 'Could not load this payment.')))
    return () => {
      cancelled = true
    }
  }, [orderId])

  if (!orderId) return <ErrorMessage message="Missing order reference." />
  if (error) return <ErrorMessage message={error} />
  if (!result) return <Loader label="Updating your order…" />

  // If the payment actually went through (e.g. paid in another tab), say so.
  if (result.payment.status === 'succeeded') {
    return (
      <div className="mx-auto max-w-lg rounded-3xl border border-slate-200 bg-white p-8 text-center">
        <h1 className="text-2xl font-extrabold text-slate-900">This order is already paid</h1>
        <Link to={`/orders/${result.order.id}`} className="mt-6 inline-block rounded-full bg-brand-700 px-5 py-2.5 text-sm font-semibold text-white">View order</Link>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-lg rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm" data-testid="payment-result">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-red-100 text-2xl text-red-600">✕</div>
      <h1 className="mt-4 text-2xl font-extrabold tracking-tight text-slate-900">Payment failed</h1>
      <p className="mt-2 text-sm text-slate-600" data-testid="payment-detail">{result.detail}</p>
      <p className="mt-1 text-sm text-slate-600">Your cart has been kept — you can try again whenever you&apos;re ready.</p>
      <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
        <Link to="/checkout" className="rounded-full bg-brand-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-800">
          Try again
        </Link>
        <Link to="/cart" className="rounded-full border border-slate-300 px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">
          Back to cart
        </Link>
      </div>
    </div>
  )
}
