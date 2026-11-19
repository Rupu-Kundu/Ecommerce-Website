import { Link } from 'react-router-dom'

const YEAR = new Date().getFullYear()

export default function Footer() {
  return (
    <footer className="border-t border-slate-200 bg-white">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-2 px-4 py-6 text-sm text-slate-500 sm:flex-row">
        <p>© {YEAR} ShopEase. All rights reserved.</p>
        <div className="flex gap-4">
          <Link to="/" className="hover:text-slate-800">Home</Link>
          <Link to="/products" className="hover:text-slate-800">Products</Link>
        </div>
      </div>
    </footer>
  )
}
