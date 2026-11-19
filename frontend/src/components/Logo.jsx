/**
 * Haatbox logo: a shopping-bag mark + "haatbox" wordmark.
 * "Haat" is the Bangla word for a traditional market; "box" = what arrives at your door.
 * variant="dark" for light backgrounds (navbar), "light" for dark backgrounds (footer).
 */
export default function Logo({ variant = 'dark', className = '' }) {
  const word = variant === 'light' ? 'text-white' : 'text-slate-900'
  const accent = variant === 'light' ? 'text-brand-300' : 'text-brand-600'

  return (
    <span className={`inline-flex items-center gap-2 ${className}`} aria-label="Haatbox">
      <svg viewBox="0 0 32 32" className="h-8 w-8 shrink-0" aria-hidden="true">
        <rect width="32" height="32" rx="8" className="fill-brand-700" />
        <path d="M9 13.5h14l-1.2 10.2a2 2 0 0 1-2 1.8h-7.6a2 2 0 0 1-2-1.8L9 13.5Z" fill="#fff" />
        <path d="M12.5 13.5V12a3.5 3.5 0 0 1 7 0v1.5" stroke="#fff" strokeWidth="2" strokeLinecap="round" fill="none" />
        <circle cx="16" cy="19" r="2" className="fill-accent-400" />
      </svg>
      <span className="text-xl font-extrabold leading-none tracking-tight" aria-hidden="true">
        <span className={word}>haat</span>
        <span className={accent}>box</span>
      </span>
    </span>
  )
}
