import { Link } from 'react-router-dom'
import { formatPrice } from '../utils/format'
import ProductImage from './ProductImage'

export default function ProductCard({ product }) {
  const inStock = product.stock_quantity > 0

  return (
    <Link
      to={`/products/${product.id}`}
      className="group flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
    >
      <div className="aspect-square overflow-hidden">
        <ProductImage product={product} className="transition group-hover:scale-105" />
      </div>
      <div className="flex flex-1 flex-col gap-1 p-4">
        <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
          {product.category_name}
        </span>
        <h3 className="line-clamp-2 font-semibold text-slate-900 group-hover:text-indigo-700">
          {product.name}
        </h3>
        <div className="mt-auto flex items-center justify-between pt-2">
          <span className="text-lg font-bold text-slate-900">{formatPrice(product.price)}</span>
          <span className={`text-xs font-medium ${inStock ? 'text-emerald-600' : 'text-red-600'}`}>
            {inStock ? 'In stock' : 'Out of stock'}
          </span>
        </div>
      </div>
    </Link>
  )
}
