import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import ErrorMessage from '../components/ErrorMessage'
import FormField from '../components/FormField'
import Loader from '../components/Loader'
import Notices from '../components/Notices'
import OrderSummary from '../components/OrderSummary'
import useCart from '../context/useCart'
import { getErrorMessage } from '../services/api'
import { createOrder } from '../services/orderService'
import { createPaymentSession, getPaymentConfig } from '../services/paymentService'
import { getSavedAddresses, getShippingMethods, previewShippingCost } from '../services/checkoutService'
import { formatPrice } from '../utils/format'

const EMPTY_ADDRESS = {
  recipient_name: '',
  phone: '',
  street_address: '',
  city: '',
  postal_code: '',
  country: '',
}
const NEW_ADDRESS = 'new'
const PHONE_RE = /^\+?[0-9][0-9\s\-()]{5,18}[0-9]$/
const POSTAL_RE = /^[A-Za-z0-9][A-Za-z0-9\s-]{1,9}$/

function validateAddress(address) {
  const errors = {}
  const value = (field) => address[field].trim()
  if (value('recipient_name').length < 2) errors.recipient_name = "Enter the recipient's full name."
  if (!PHONE_RE.test(value('phone'))) errors.phone = 'Enter a valid phone number.'
  if (!value('street_address')) errors.street_address = 'Street address is required.'
  if (!value('city')) errors.city = 'City is required.'
  if (!POSTAL_RE.test(value('postal_code'))) errors.postal_code = 'Enter a valid postal code.'
  if (!value('country')) errors.country = 'Country is required.'
  return errors
}

function formatAddress(a) {
  return `${a.street_address}, ${a.city} ${a.postal_code}, ${a.country}`
}

export default function CheckoutPage() {
  const { cart, refreshCart, setCart, clearNotices } = useCart()
  useEffect(() => clearNotices, [clearNotices]) // clear stock notices when leaving the page

  const [methods, setMethods] = useState([])
  const [savedAddresses, setSavedAddresses] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [reloadKey, setReloadKey] = useState(0)

  const [addressChoice, setAddressChoice] = useState(NEW_ADDRESS)
  const [address, setAddress] = useState(EMPTY_ADDRESS)
  const [fieldErrors, setFieldErrors] = useState({})
  const [shippingMethod, setShippingMethod] = useState('standard')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [paymentProvider, setPaymentProvider] = useState(null) // 'stripe' | 'demo'

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setLoadError('')
      try {
        const [methodList, addresses] = await Promise.all([
          getShippingMethods(),
          getSavedAddresses(),
          refreshCart(),
          getPaymentConfig().then((c) => !cancelled && setPaymentProvider(c.provider)).catch(() => {}),
        ])
        if (cancelled) return
        setMethods(methodList)
        setSavedAddresses(addresses)
        setAddressChoice(addresses.length ? String(addresses[0].id) : NEW_ADDRESS)
      } catch (err) {
        if (!cancelled) setLoadError(getErrorMessage(err, 'Could not load checkout.'))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [refreshCart, reloadKey])

  // Preview only — the server recalculates everything on submit.
  const selectedMethod = methods.find((m) => m.code === shippingMethod)
  const previewShipping = previewShippingCost(selectedMethod, cart.subtotal)
  const previewTotal = Number(cart.subtotal) + previewShipping

  function handleAddressChange(event) {
    const { name, value } = event.target
    setAddress((a) => ({ ...a, [name]: value }))
    setFieldErrors((errs) => ({ ...errs, [name]: undefined }))
    setSubmitError('')
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setSubmitError('')

    const usingNew = addressChoice === NEW_ADDRESS
    if (usingNew) {
      const errors = validateAddress(address)
      setFieldErrors(errors)
      if (Object.keys(errors).length) {
        setSubmitError('Please fix the highlighted fields.')
        return
      }
    }

    const payload = { shipping_method: shippingMethod }
    if (usingNew) payload.address = address
    else payload.address_id = Number(addressChoice)

    setSubmitting(true)
    try {
      // 1) Server re-checks the cart, saves the address and creates the order (awaiting payment).
      const order = await createOrder(payload)
      // 2) Start a test payment for that order and go to the payment page.
      const session = await createPaymentSession(order.id)
      window.location.assign(session.checkout_url)
      return // keep the button disabled while the browser leaves the page
    } catch (err) {
      const status = err.response?.status
      const data = err.response?.data
      if (status === 409 && data?.cart) {
        setCart(data.cart) // server changed the cart (stock) → show the user
        setSubmitError(data.detail)
      } else if (status === 400 && data?.address && typeof data.address === 'object') {
        setFieldErrors(data.address)
        setSubmitError('Please fix the highlighted fields.')
      } else {
        if (data?.cart) setCart(data.cart)
        setSubmitError(getErrorMessage(err, 'Checkout failed. Please try again.'))
        if (status === 400) refreshCart().catch(() => {}) // e.g. stock changed when starting payment
      }
      setSubmitting(false)
    }
  }

  if (loading) return <Loader label="Loading checkout..." />
  if (loadError) return <ErrorMessage message={loadError} onRetry={() => setReloadKey((k) => k + 1)} />

  if (cart.items.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white py-16 text-center">
        <Notices notices={cart.notices} />
        <p className="text-lg font-medium text-slate-900">Your cart is empty</p>
        <Link to="/products" className="mt-4 inline-block font-medium text-brand-700 hover:underline">
          Continue shopping
        </Link>
      </div>
    )
  }

  const sectionClass = 'rounded-xl border border-slate-200 bg-white p-5'

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-slate-900">Checkout</h1>
      <Notices notices={cart.notices} />

      <form onSubmit={handleSubmit} noValidate className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {/* Shipping address + delivery contact */}
          <section className={sectionClass} aria-labelledby="address-heading">
            <h2 id="address-heading" className="mb-4 text-lg font-bold text-slate-900">
              Shipping address
            </h2>

            {savedAddresses.length > 0 && (
              <fieldset className="mb-4 space-y-2">
                <legend className="sr-only">Choose an address</legend>
                {savedAddresses.map((a) => (
                  <label key={a.id} className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 p-3 has-checked:border-brand-500 has-checked:bg-brand-50">
                    <input
                      type="radio"
                      name="address_choice"
                      value={a.id}
                      checked={addressChoice === String(a.id)}
                      onChange={(e) => {
                        setAddressChoice(e.target.value)
                                          }}
                      className="mt-1"
                    />
                    <span className="text-sm">
                      <span className="font-semibold text-slate-900">{a.recipient_name}</span> · {a.phone}
                      <br />
                      <span className="text-slate-600">{formatAddress(a)}</span>
                    </span>
                  </label>
                ))}
                <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-slate-200 p-3 has-checked:border-brand-500 has-checked:bg-brand-50">
                  <input
                    type="radio"
                    name="address_choice"
                    value={NEW_ADDRESS}
                    checked={addressChoice === NEW_ADDRESS}
                    onChange={(e) => {
                      setAddressChoice(e.target.value)
                                      }}
                  />
                  <span className="text-sm font-medium text-slate-900">Use a new address</span>
                </label>
              </fieldset>
            )}

            {addressChoice === NEW_ADDRESS && (
              <div className="space-y-4">
                <div>
                  <h3 className="mb-3 text-sm font-semibold text-slate-700">Delivery contact</h3>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <FormField label="Recipient name" name="recipient_name" autoComplete="name" value={address.recipient_name} onChange={handleAddressChange} error={fieldErrors.recipient_name} />
                    <FormField label="Phone number" name="phone" type="tel" autoComplete="tel" placeholder="+880 1712-345678" value={address.phone} onChange={handleAddressChange} error={fieldErrors.phone} />
                  </div>
                </div>
                <FormField label="Street address" name="street_address" autoComplete="street-address" value={address.street_address} onChange={handleAddressChange} error={fieldErrors.street_address} />
                <div className="grid gap-4 sm:grid-cols-3">
                  <FormField label="City" name="city" autoComplete="address-level2" value={address.city} onChange={handleAddressChange} error={fieldErrors.city} />
                  <FormField label="Postal code" name="postal_code" autoComplete="postal-code" value={address.postal_code} onChange={handleAddressChange} error={fieldErrors.postal_code} />
                  <FormField label="Country" name="country" autoComplete="country-name" value={address.country} onChange={handleAddressChange} error={fieldErrors.country} />
                </div>
              </div>
            )}
          </section>

          {/* Shipping method */}
          <section className={sectionClass} aria-labelledby="shipping-heading">
            <h2 id="shipping-heading" className="mb-4 text-lg font-bold text-slate-900">
              Shipping method
            </h2>
            <fieldset className="space-y-2">
              <legend className="sr-only">Choose a shipping method</legend>
              {methods.map((m) => {
                const cost = previewShippingCost(m, cart.subtotal)
                return (
                  <label key={m.code} className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-slate-200 p-3 has-checked:border-brand-500 has-checked:bg-brand-50">
                    <span className="flex items-center gap-3">
                      <input
                        type="radio"
                        name="shipping_method"
                        value={m.code}
                        checked={shippingMethod === m.code}
                        onChange={(e) => {
                          setShippingMethod(e.target.value)
                                              }}
                      />
                      <span className="text-sm">
                        <span className="font-semibold text-slate-900">{m.label}</span>
                        <span className="block text-slate-500">
                          {m.description}
                          {m.free_over && ` · free over ${formatPrice(m.free_over)}`}
                        </span>
                      </span>
                    </span>
                    <span className="text-sm font-semibold">{cost === 0 ? 'Free' : formatPrice(cost)}</span>
                  </label>
                )
              })}
            </fieldset>
          </section>

          {/* Items being ordered */}
          <section className={sectionClass} aria-labelledby="items-heading">
            <div className="mb-3 flex items-center justify-between">
              <h2 id="items-heading" className="text-lg font-bold text-slate-900">Items</h2>
              <Link to="/cart" className="text-sm font-medium text-brand-700 hover:underline">Edit cart</Link>
            </div>
            <ul className="divide-y divide-slate-100 text-sm">
              {cart.items.map((item) => (
                <li key={item.id} className="flex justify-between py-2">
                  <span className="text-slate-700">
                    {item.product.name} <span className="text-slate-400">× {item.quantity}</span>
                  </span>
                  <span className="font-medium tabular-nums">{formatPrice(item.line_total)}</span>
                </li>
              ))}
            </ul>
          </section>
        </div>

        {/* Summary + submit */}
        <div className="lg:sticky lg:top-20 lg:self-start">
          <OrderSummary itemCount={cart.total_items} subtotal={cart.subtotal} shipping={previewShipping}>
            {submitError && (
              <div role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
                {submitError}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-full bg-brand-700 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-800 disabled:opacity-60"
            >
              {submitting ? 'Redirecting to payment…' : `Pay ${formatPrice(previewTotal)}`}
            </button>
            <p className="text-center text-xs text-slate-500" data-testid="payment-mode">
              🔒 {paymentProvider === 'stripe'
                ? 'Secure payment by Stripe (test mode). Your card details never touch our servers.'
                : 'Test mode: demo payment gateway — no real money is charged.'}
            </p>
            <Link to="/cart" className="block text-center text-sm font-medium text-slate-600 hover:text-slate-900">
              ← Back to cart
            </Link>
          </OrderSummary>
        </div>
      </form>
    </div>
  )
}
