import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import FormField from '../components/FormField'
import useAuth from '../context/useAuth'
import { getErrorMessage } from '../services/api'

const EMPTY_FORM = {
  username: '',
  email: '',
  first_name: '',
  last_name: '',
  password: '',
  password_confirm: '',
}

function validate(form) {
  const errors = {}
  if (!form.username.trim()) errors.username = 'Username is required.'
  if (!form.email.trim()) errors.email = 'Email is required.'
  else if (!/^\S+@\S+\.\S+$/.test(form.email)) errors.email = 'Enter a valid email address.'
  if (form.password.length < 8) errors.password = 'Password must be at least 8 characters.'
  if (form.password !== form.password_confirm) errors.password_confirm = 'Passwords do not match.'
  return errors
}

export default function RegisterPage() {
  const { register } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const from = location.state?.from?.pathname || '/'

  const [form, setForm] = useState(EMPTY_FORM)
  const [fieldErrors, setFieldErrors] = useState({})
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  function handleChange(event) {
    const { name, value } = event.target
    setForm((f) => ({ ...f, [name]: value }))
    setFieldErrors((errs) => ({ ...errs, [name]: undefined }))
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    const errors = validate(form)
    setFieldErrors(errors)
    if (Object.keys(errors).length) return

    setSubmitting(true)
    try {
      await register({ ...form, username: form.username.trim(), email: form.email.trim() })
      navigate(from, { replace: true })
    } catch (err) {
      const data = err.response?.data
      if (err.response?.status === 400 && data && typeof data === 'object') {
        // Show the backend's per-field messages next to each input.
        setFieldErrors(data)
        if (data.non_field_errors) setError(data.non_field_errors.join(' '))
      } else {
        setError(getErrorMessage(err, 'Registration failed. Please try again.'))
      }
      setSubmitting(false)
    }
  }

  return (
    <div className="mx-auto max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
      <h1 className="text-2xl font-bold text-slate-900">Create an account</h1>
      <p className="mt-1 text-sm text-slate-500">Join us to start shopping.</p>

      {error && (
        <div role="alert" className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="mt-6 space-y-4" noValidate>
        <FormField label="Username" name="username" autoComplete="username" value={form.username} onChange={handleChange} error={fieldErrors.username} />
        <FormField label="Email" name="email" type="email" autoComplete="email" value={form.email} onChange={handleChange} error={fieldErrors.email} />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField label="First name (optional)" name="first_name" autoComplete="given-name" value={form.first_name} onChange={handleChange} error={fieldErrors.first_name} />
          <FormField label="Last name (optional)" name="last_name" autoComplete="family-name" value={form.last_name} onChange={handleChange} error={fieldErrors.last_name} />
        </div>
        <FormField label="Password" name="password" type="password" autoComplete="new-password" value={form.password} onChange={handleChange} error={fieldErrors.password} />
        <FormField label="Confirm password" name="password_confirm" type="password" autoComplete="new-password" value={form.password_confirm} onChange={handleChange} error={fieldErrors.password_confirm} />
        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-md bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
        >
          {submitting ? 'Creating account...' : 'Register'}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-slate-600">
        Already have an account?{' '}
        <Link to="/login" state={location.state} className="font-medium text-indigo-700 hover:underline">
          Log in
        </Link>
      </p>
    </div>
  )
}
