import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import FormField from '../components/FormField'
import useAuth from '../context/useAuth'
import { getErrorMessage } from '../services/api'

export default function LoginPage() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const from = location.state?.from?.pathname || '/'

  const [form, setForm] = useState({ username: '', password: '' })
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  function handleChange(event) {
    setForm((f) => ({ ...f, [event.target.name]: event.target.value }))
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    if (!form.username.trim() || !form.password) {
      setError('Please enter your username and password.')
      return
    }
    setSubmitting(true)
    try {
      await login(form.username.trim(), form.password)
      navigate(from, { replace: true })
    } catch (err) {
      setError(
        err.response?.status === 401
          ? 'Incorrect username or password.'
          : getErrorMessage(err, 'Login failed. Please try again.'),
      )
      setSubmitting(false)
    }
  }

  return (
    <div className="mx-auto max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
      <h1 className="text-2xl font-bold text-slate-900">Log in</h1>
      <p className="mt-1 text-sm text-slate-500">Welcome back! Log in to continue shopping.</p>

      {error && (
        <div role="alert" className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="mt-6 space-y-4" noValidate>
        <FormField label="Username" name="username" autoComplete="username" value={form.username} onChange={handleChange} />
        <FormField
          label="Password"
          name="password"
          type="password"
          autoComplete="current-password"
          value={form.password}
          onChange={handleChange}
        />
        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-md bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
        >
          {submitting ? 'Logging in...' : 'Log in'}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-slate-600">
        Don&apos;t have an account?{' '}
        <Link to="/register" state={location.state} className="font-medium text-indigo-700 hover:underline">
          Register
        </Link>
      </p>
    </div>
  )
}
