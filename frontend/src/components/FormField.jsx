/** Labeled input with an optional error message (errors may be a string or an array). */
export default function FormField({ label, name, error, ...inputProps }) {
  const message = Array.isArray(error) ? error.join(' ') : error
  return (
    <div>
      <label htmlFor={name} className="mb-1 block text-sm font-medium text-slate-700">
        {label}
      </label>
      <input
        id={name}
        name={name}
        aria-invalid={Boolean(message)}
        aria-describedby={message ? `${name}-error` : undefined}
        className={`w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-2 ${
          message
            ? 'border-red-400 focus:ring-red-200'
            : 'border-slate-300 focus:border-indigo-500 focus:ring-indigo-200'
        }`}
        {...inputProps}
      />
      {message && (
        <p id={`${name}-error`} className="mt-1 text-xs text-red-600">
          {message}
        </p>
      )}
    </div>
  )
}
