import { Link } from 'react-router-dom'
import Logo from './Logo'

const YEAR = new Date().getFullYear()

// Demo contact details — replace with the real business details before launch.
const CONTACT = {
  address: 'House 12, Road 5, Dhanmondi, Dhaka 1205',
  phone: '+880 1700-000000',
  email: 'support@haatbox.com.bd',
  hours: 'Sat–Thu, 9 AM – 9 PM',
}

const QUICK_LINKS = [
  { to: '/', label: 'Home' },
  { to: '/products', label: 'All products' },
  { to: '/cart', label: 'My cart' },
  { to: '/login', label: 'My account' },
]

const SUPPORT_LINKS = [
  { to: '/help', label: 'Help center' },
  { to: '/help#shipping', label: 'Shipping & delivery' },
  { to: '/help#returns', label: 'Returns & refunds' },
  { to: '/help#payment', label: 'Payment methods' },
  { to: '/help#faq', label: 'FAQ' },
]

const SOCIAL = [
  {
    label: 'Facebook',
    href: 'https://www.facebook.com/',
    path: 'M13.5 21v-7.5h2.5l.4-3h-2.9V8.6c0-.9.3-1.5 1.5-1.5h1.5V4.4c-.3 0-1.2-.1-2.2-.1-2.2 0-3.7 1.3-3.7 3.8v2.4H8v3h2.6V21h2.9Z',
  },
  {
    label: 'Instagram',
    href: 'https://www.instagram.com/',
    // outline icon (rounded square + lens + dot)
    icon: (
      <g fill="none" stroke="currentColor" strokeWidth="1.8">
        <rect x="4" y="4" width="16" height="16" rx="4.5" />
        <circle cx="12" cy="12" r="3.6" />
        <circle cx="16.8" cy="7.2" r="0.6" fill="currentColor" stroke="none" />
      </g>
    ),
  },
  {
    label: 'YouTube',
    href: 'https://www.youtube.com/',
    path: 'M21 8.2a2.4 2.4 0 0 0-1.7-1.7C17.8 6 12 6 12 6s-5.8 0-7.3.5A2.4 2.4 0 0 0 3 8.2 25 25 0 0 0 2.6 12c0 1.3.1 2.6.4 3.8a2.4 2.4 0 0 0 1.7 1.7C6.2 18 12 18 12 18s5.8 0 7.3-.5a2.4 2.4 0 0 0 1.7-1.7c.3-1.2.4-2.5.4-3.8s-.1-2.6-.4-3.8ZM10.2 14.4V9.6l4.4 2.4-4.4 2.4Z',
  },
  {
    label: 'X (Twitter)',
    href: 'https://x.com/',
    path: 'M17.2 4h2.7l-5.9 6.7L21 20h-5.4l-4.2-5.5L6.5 20H3.8l6.3-7.2L3.4 4h5.6l3.8 5 4.4-5Zm-1 14.4h1.5L8 5.5H6.4l9.8 12.9Z',
  },
]

function FooterHeading({ children }) {
  return <h3 className="text-sm font-bold uppercase tracking-wider text-white">{children}</h3>
}

const linkClass = 'text-sm text-slate-300 transition-colors hover:text-brand-300'

export default function Footer() {
  return (
    <footer className="mt-16 bg-brand-950 text-slate-300">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1.3fr]">
        {/* Brand */}
        <div>
          <Link to="/" aria-label="Haatbox home" className="inline-block">
            <Logo variant="light" />
          </Link>
          <p className="mt-4 max-w-xs text-sm leading-relaxed text-slate-400">
            Your everyday online haat — quality electronics, fashion, books, home, sports and beauty
            essentials, delivered across Bangladesh.
          </p>
          <div className="mt-5 flex gap-2">
            {SOCIAL.map((s) => (
              <a
                key={s.label}
                href={s.href}
                target="_blank"
                rel="noreferrer"
                aria-label={s.label}
                className="flex h-9 w-9 items-center justify-center rounded-full bg-white/5 text-slate-300 ring-1 ring-white/10 transition hover:bg-brand-600 hover:text-white"
              >
                <svg viewBox="0 0 24 24" className="h-4.5 w-4.5" fill="currentColor" aria-hidden="true">
                  {s.icon ?? <path d={s.path} />}
                </svg>
              </a>
            ))}
          </div>
        </div>

        {/* Quick links */}
        <nav aria-label="Quick links">
          <FooterHeading>Quick links</FooterHeading>
          <ul className="mt-4 space-y-2.5">
            {QUICK_LINKS.map((l) => (
              <li key={l.label}><Link to={l.to} className={linkClass}>{l.label}</Link></li>
            ))}
          </ul>
        </nav>

        {/* Customer support */}
        <nav aria-label="Customer support">
          <FooterHeading>Customer support</FooterHeading>
          <ul className="mt-4 space-y-2.5">
            {SUPPORT_LINKS.map((l) => (
              <li key={l.label}><Link to={l.to} className={linkClass}>{l.label}</Link></li>
            ))}
          </ul>
        </nav>

        {/* Contact */}
        <div>
          <FooterHeading>Contact us</FooterHeading>
          <ul className="mt-4 space-y-3 text-sm">
            <li className="text-slate-400">{CONTACT.address}</li>
            <li>
              <a href={`tel:${CONTACT.phone.replace(/[\s-]/g, '')}`} className={linkClass}>{CONTACT.phone}</a>
            </li>
            <li>
              <a href={`mailto:${CONTACT.email}`} className={linkClass}>{CONTACT.email}</a>
            </li>
            <li className="text-slate-400">{CONTACT.hours}</li>
          </ul>
        </div>
      </div>

      <div className="border-t border-white/10">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-2 px-4 py-5 text-xs text-slate-400 sm:flex-row">
          <p>© {YEAR} Haatbox. All rights reserved.</p>
          <p>Prices in Bangladeshi Taka (৳) · Secure checkout</p>
        </div>
      </div>
    </footer>
  )
}
