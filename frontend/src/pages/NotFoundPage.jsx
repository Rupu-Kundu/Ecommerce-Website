import { Link } from 'react-router-dom'

export default function NotFoundPage({ message = "The page you're looking for doesn't exist." }) {
  return (
    <div className="py-20 text-center">
      <p className="text-6xl font-extrabold text-indigo-600">404</p>
      <h1 className="mt-4 text-2xl font-bold text-slate-900">Page not found</h1>
      <p className="mt-2 text-slate-500">{message}</p>
      <Link
        to="/"
        className="mt-6 inline-block rounded-md bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700"
      >
        Go home
      </Link>
    </div>
  )
}
