import { formatPrice } from '../utils/format'

/**
 * Price breakdown box. Pass `shipping` (number) to show shipping and total;
 * leave it undefined on the cart page where shipping isn't chosen yet.
 */
export default function OrderSummary({ itemCount, subtotal, shipping, children }) {
  const hasShipping = shipping !== undefined
  const total = Number(subtotal) + (hasShipping ? Number(shipping) : 0)

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5" aria-label="Order summary">
      <h2 className="mb-4 text-lg font-bold text-slate-900">Order summary</h2>
      <dl className="space-y-2 text-sm">
        <div className="flex justify-between">
          <dt className="text-slate-600">
            Subtotal ({itemCount} {itemCount === 1 ? 'item' : 'items'})
          </dt>
          <dd className="font-medium tabular-nums" data-testid="subtotal">{formatPrice(subtotal)}</dd>
        </div>
        {hasShipping ? (
          <div className="flex justify-between">
            <dt className="text-slate-600">Shipping</dt>
            <dd className="font-medium tabular-nums" data-testid="shipping">
              {Number(shipping) === 0 ? 'Free' : formatPrice(shipping)}
            </dd>
          </div>
        ) : (
          <p className="text-xs text-slate-500">Shipping is calculated at checkout.</p>
        )}
        {hasShipping && (
          <div className="flex justify-between border-t border-slate-200 pt-3 text-base">
            <dt className="font-semibold text-slate-900">Total</dt>
            <dd className="font-bold tabular-nums text-slate-900" data-testid="total">{formatPrice(total)}</dd>
          </div>
        )}
      </dl>
      {children && <div className="mt-5 space-y-2">{children}</div>}
    </section>
  )
}
