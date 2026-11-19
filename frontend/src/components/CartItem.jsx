import { Link } from 'react-router-dom'
import { formatPrice } from '../utils/format'
import ProductImage from './ProductImage'
import QuantityControl from './QuantityControl'

export default function CartItem({ item, busy, onQuantityChange, onRemove }) {
  const { product } = item

  return (
    <li className="flex gap-4 py-4" data-testid="cart-item">
      <Link to={`/products/${product.id}`} className="h-20 w-20 shrink-0 overflow-hidden rounded-lg sm:h-24 sm:w-24">
        <ProductImage product={product} className="text-2xl" />
      </Link>

      <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <Link to={`/products/${product.id}`} className="font-semibold text-slate-900 hover:text-brand-700">
            {product.name}
          </Link>
          <p className="text-sm text-slate-500">{formatPrice(product.price)} each</p>
          {item.quantity >= product.stock_quantity && (
            <p className="text-xs text-amber-700">Max available: {product.stock_quantity}</p>
          )}
        </div>

        <div className="flex items-center justify-between gap-4 sm:justify-end">
          <QuantityControl
            value={item.quantity}
            max={product.stock_quantity}
            disabled={busy}
            onChange={(qty) => onQuantityChange(item, qty)}
            label={`Quantity for ${product.name}`}
          />
          <span className="w-20 text-right font-semibold tabular-nums" data-testid="line-total">
            {formatPrice(item.line_total)}
          </span>
          <button
            type="button"
            onClick={() => onRemove(item)}
            disabled={busy}
            className="text-sm font-medium text-red-600 hover:text-red-700 disabled:opacity-40"
            aria-label={`Remove ${product.name}`}
          >
            Remove
          </button>
        </div>
      </div>
    </li>
  )
}
