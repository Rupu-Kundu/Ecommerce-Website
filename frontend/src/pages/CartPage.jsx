import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import CartItem from '../components/CartItem'
import ErrorMessage from '../components/ErrorMessage'
import Loader from '../components/Loader'
import Notices from '../components/Notices'
import OrderSummary from '../components/OrderSummary'
import useCart from '../context/useCart'
import { getErrorMessage } from '../services/api'

export default function CartPage() {
  const { cart, refreshCart, clearNotices, updateQuantity, removeItem } = useCart()
  const [initialLoading, setInitialLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [actionError, setActionError] = useState('')
  const [busyItemId, setBusyItemId] = useState(null)
  const [reloadKey, setReloadKey] = useState(0)

  // Re-fetch on open so the server can drop unavailable items and report it.
  useEffect(() => {
    let cancelled = false
    refreshCart()
      .then(() => !cancelled && setLoadError(''))
      .catch((err) => !cancelled && setLoadError(getErrorMessage(err, 'Could not load your cart.')))
      .finally(() => !cancelled && setInitialLoading(false))
    return () => {
      cancelled = true
    }
  }, [refreshCart, reloadKey])

  useEffect(() => clearNotices, [clearNotices]) // clear stock notices when leaving the page

  async function runItemAction(item, action) {
    setActionError('')
    setBusyItemId(item.id)
    try {
      await action()
    } catch (err) {
      setActionError(getErrorMessage(err, 'Could not update your cart.'))
    } finally {
      setBusyItemId(null)
    }
  }

  const handleQuantityChange = (item, quantity) => runItemAction(item, () => updateQuantity(item.id, quantity))
  const handleRemove = (item) => runItemAction(item, () => removeItem(item.id))

  if (initialLoading) return <Loader label="Loading your cart..." />
  if (loadError) return <ErrorMessage message={loadError} onRetry={() => setReloadKey((k) => k + 1)} />

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-slate-900">Shopping cart</h1>
      <Notices notices={cart.notices} />
      {actionError && (
        <div role="alert" className="mb-6 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {actionError}
        </div>
      )}

      {cart.items.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white py-16 text-center">
          <p className="text-lg font-medium text-slate-900">Your cart is empty</p>
          <p className="mt-1 text-sm text-slate-500">Browse our products and add something you like.</p>
          <Link
            to="/products"
            className="mt-6 inline-block rounded-md bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-700"
          >
            Continue shopping
          </Link>
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-3">
          <ul className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white px-4 lg:col-span-2">
            {cart.items.map((item) => (
              <CartItem
                key={item.id}
                item={item}
                busy={busyItemId === item.id}
                onQuantityChange={handleQuantityChange}
                onRemove={handleRemove}
              />
            ))}
          </ul>

          <div className="lg:sticky lg:top-20 lg:self-start">
            <OrderSummary itemCount={cart.total_items} subtotal={cart.subtotal}>
              <Link
                to="/checkout"
                className="block w-full rounded-md bg-brand-600 px-4 py-2.5 text-center text-sm font-semibold text-white hover:bg-brand-700"
              >
                Proceed to checkout
              </Link>
              <Link
                to="/products"
                className="block w-full rounded-md border border-slate-300 px-4 py-2.5 text-center text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Continue shopping
              </Link>
            </OrderSummary>
          </div>
        </div>
      )}
    </div>
  )
}
