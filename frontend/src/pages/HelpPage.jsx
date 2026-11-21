import { useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { LazyLocationMap } from '../components/map/LazyMaps'
import { CONTACT, STORE_LOCATION } from '../utils/store'

const SECTIONS = [
  {
    id: 'shipping',
    title: 'Shipping & delivery',
    body: [
      'Standard delivery (3–5 business days): ৳120, free on orders of ৳5,000 or more.',
      'Express delivery (1–2 business days): ৳300.',
      'We deliver across Bangladesh. Delivery times may be longer during public holidays.',
    ],
  },
  {
    id: 'returns',
    title: 'Returns & refunds',
    body: [
      'Unused items in original packaging can be returned within 7 days of delivery.',
      'Contact our support team with your order details to start a return.',
    ],
  },
  {
    id: 'payment',
    title: 'Payment methods',
    body: [
      'Pay by Card (Visa, Mastercard — via Stripe), bKash or Nagad. All prices are in Bangladeshi Taka (৳).',
      'Cash on delivery (COD): choose "COD" at checkout and pay the rider in cash when your order arrives (orders up to ৳50,000).',
      'You pay on the secure Stripe, bKash or Nagad page. We never see or store your card number, PIN or OTP.',
    ],
  },
  {
    id: 'faq',
    title: 'Frequently asked questions',
    body: [
      'Do I need an account to shop? You can browse without one; an account is needed to use the cart and check out.',
      'Is my cart saved? Yes — your cart is stored with your account, so it is still there after you log out and back in.',
      'Can I change my delivery address? Yes, choose a saved address or add a new one at checkout. You can also drop a pin on the map so the rider finds your door.',
      'Can I talk to a person? Yes — open the chat (bottom right) and tap "Chat with our team". The AI assistant can also hand you over.',
    ],
  },
]

export default function HelpPage() {
  const { hash } = useLocation()

  // Footer links point to /help#section — scroll to that section.
  useEffect(() => {
    if (!hash) return
    document.getElementById(hash.slice(1))?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [hash])

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">Help center</h1>
      <p className="mt-2 text-slate-600">Answers to common questions about shopping with Haatbox.</p>

      <div className="mt-8 space-y-6">
        {SECTIONS.map((s) => (
          <section key={s.id} id={s.id} className="scroll-mt-24 rounded-2xl border border-slate-200 bg-white p-6">
            <h2 className="text-lg font-bold text-slate-900">{s.title}</h2>
            <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-slate-600">
              {s.body.map((line) => <li key={line}>{line}</li>)}
            </ul>
          </section>
        ))}

        <section id="visit" className="scroll-mt-24 rounded-2xl border border-slate-200 bg-white p-6">
          <h2 className="text-lg font-bold text-slate-900">Visit our store</h2>
          <div className="mt-3 grid gap-5 sm:grid-cols-5">
            <div className="space-y-1.5 text-sm text-slate-600 sm:col-span-2">
              <p className="font-semibold text-slate-900">{STORE_LOCATION.name}</p>
              <p>{CONTACT.address}</p>
              <p>{CONTACT.hours}</p>
              <p>
                <a href={`tel:${CONTACT.phone.replace(/[\s-]/g, '')}`} className="font-semibold text-brand-700 hover:underline">{CONTACT.phone}</a>
              </p>
              <p className="pt-1 text-xs text-slate-500">See products in person and pick up online orders.</p>
            </div>
            <div className="sm:col-span-3">
              <LazyLocationMap lat={STORE_LOCATION.lat} lng={STORE_LOCATION.lng} label="Haatbox" zoom={15} className="h-64" />
            </div>
          </div>
        </section>
      </div>

      <p className="mt-8 text-sm text-slate-600">
        Still need help? Email{' '}
        <a href="mailto:support@haatbox.com.bd" className="font-semibold text-brand-700 hover:underline">support@haatbox.com.bd</a>{' '}
        or <Link to="/products" className="font-semibold text-brand-700 hover:underline">continue shopping</Link>.
      </p>
    </div>
  )
}
