import ProductCard from './ProductCard'

export default function ProductGrid({ products, emptyMessage = 'No products found.' }) {
  if (!products.length) {
    return <p className="py-16 text-center text-slate-500">{emptyMessage}</p>
  }
  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {products.map((product) => (
        <ProductCard key={product.id} product={product} />
      ))}
    </div>
  )
}
