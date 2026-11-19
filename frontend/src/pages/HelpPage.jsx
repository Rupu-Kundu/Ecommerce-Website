import { useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'

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
      'Secure online card payment is being added. All prices are shown in Bangladeshi Taka (৳).',
      'We never store your card details.',
    ],
  },
  {
    id: 'faq',
    title: 'Frequently asked questions',
    body: [
      'Do I need an account to shop? You can browse without one; an account is needed to use the cart and check out.',
      'Is my cart saved? Yes — your cart is stored with your account, so it is still there after you log out and back in.',
      'Can I change my delivery address? Yes, choose a saved address or add a new one at checkout.',
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
      </div>

      <p className="mt-8 text-sm text-slate-600">
        Still need help? Email{' '}
        <a href="mailto:support@haatbox.com.bd" className="font-semibold text-brand-700 hover:underline">support@haatbox.com.bd</a>{' '}
        or <Link to="/products" className="font-semibold text-brand-700 hover:underline">continue shopping</Link>.
      </p>
    </div>
  )
}
