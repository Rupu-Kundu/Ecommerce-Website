import { useState } from 'react'
import { Link } from 'react-router-dom'
import Drawer from '../../components/admin/Drawer'
import { EmptyState, ErrorBanner, FilterSelect, ListSkeleton, SearchBox, SummaryChip } from '../../components/admin/ListControls'
import { cardClass } from '../../components/admin/styles'
import ErrorMessage from '../../components/ErrorMessage'
import OrderStatusBadge from '../../components/OrderStatusBadge'
import Pagination from '../../components/Pagination'
import { PaymentMark } from '../../components/PaymentMethodPicker'
import useApiData from '../../hooks/useApiData'
import useUrlFilters from '../../hooks/useUrlFilters'
import { getAdminPayment, getAdminPayments } from '../../services/adminService'
import { formatDate, formatPrice } from '../../utils/format'

const PAGE_SIZE = 12
const KEYS = ['search', 'status', 'method', 'provider', 'days', 'ordering']
const FILTERS = [
  { key: 'status', label: 'Status', options: [['', 'All statuses'], ['succeeded', 'Succeeded'], ['pending', 'Pending'], ['failed', 'Failed'], ['refunded', 'Refunded']] },
  { key: 'method', label: 'Method', options: [['', 'All methods'], ['card', 'Card'], ['bkash', 'bKash'], ['nagad', 'Nagad'], ['cod', 'Cash on delivery']] },
  { key: 'provider', label: 'Gateway', options: [['', 'All gateways'], ['stripe', 'Stripe'], ['bkash', 'bKash'], ['nagad', 'Nagad'], ['demo', 'Demo test gateway'], ['cod', 'Cash on delivery']] },
  { key: 'days', label: 'Period', options: [['', 'All time'], ['7', 'Last 7 days'], ['30', 'Last 30 days'], ['90', 'Last 90 days']] },
  { key: 'ordering', label: 'Sort by', options: [['', 'Newest first'], ['oldest', 'Oldest first'], ['amount_high', 'Amount: high to low'], ['amount_low', 'Amount: low to high']] },
]

const dateTime = (iso) => new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })

function Field({ label, children }) {
  return (
    <div className="flex items-start justify-between gap-4 py-1.5 text-sm">
      <dt className="shrink-0 text-slate-500">{label}</dt>
      <dd className="min-w-0 text-right font-medium text-slate-900">{children}</dd>
    </div>
  )
}

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      onClick={() => navigator.clipboard?.writeText(text).then(() => {
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
      })}
      className="ml-2 rounded-md px-1.5 py-0.5 text-xs font-semibold text-brand-700 hover:bg-brand-50"
    >
      {copied ? 'Copied' : 'Copy'}
    </button>
  )
}

/** Details of one payment: transaction, order (items + address), customer, other attempts. */
function PaymentDrawer({ id, onClose, onOpen }) {
  const { data: p, error, loading, reload } = useApiData(String(id), () => getAdminPayment(id), 'Could not load this payment.')
  const ready = p && String(p.id) === String(id) && !loading
  const order = ready ? p.order_detail : null
  return (
    <Drawer
      open
      onClose={onClose}
      testId="payment-drawer"
      title={ready ? `Payment #${p.id}` : 'Payment'}
      subtitle={ready && <span className="inline-flex items-center gap-2"><PaymentMark code={p.method} size="sm" />{p.method_label} · {p.provider_label}</span>}
      footer={<p className="text-xs text-slate-500">Payments are read-only here: money moves only through checkout. Cash on delivery is collected by marking the order Delivered.</p>}
    >
      {!ready && error && !loading ? (
        <ErrorMessage message={error} onRetry={reload} />
      ) : !ready ? (
        <div className="space-y-3" aria-label="Loading payment" aria-busy="true">
          {[0, 1, 2, 3].map((i) => <div key={i} className="h-16 animate-pulse rounded-xl bg-slate-100" />)}
        </div>
      ) : (
        <div className="space-y-6">
          <div className="rounded-2xl bg-slate-50 p-4 text-center">
            <p className="text-3xl font-bold text-slate-900" data-testid="drawer-amount">{formatPrice(p.amount)}</p>
            <div className="mt-2 flex justify-center"><OrderStatusBadge status={p.status} label={p.status_label} /></div>
          </div>

          <section aria-labelledby="pd-tx">
            <h3 id="pd-tx" className="mb-1 text-sm font-bold uppercase tracking-wide text-slate-500">Transaction</h3>
            <dl className="divide-y divide-slate-100">
              <Field label="Transaction ID">
                <span className="break-all font-mono text-xs" data-testid="drawer-transaction">{p.transaction_id}</span>
                <CopyButton text={p.transaction_id} />
              </Field>
              <Field label="Gateway">{p.provider_label}</Field>
              <Field label="Method">{p.method_label}</Field>
              <Field label="Created">{dateTime(p.created_at)}</Field>
              <Field label="Last update">{dateTime(p.updated_at)}</Field>
            </dl>
          </section>

          <section aria-labelledby="pd-order">
            <div className="mb-1 flex items-center justify-between">
              <h3 id="pd-order" className="text-sm font-bold uppercase tracking-wide text-slate-500">Order</h3>
              <Link to={`/orders/${order.id}`} className="text-sm font-semibold text-brand-700 hover:underline">Order #{order.id} →</Link>
            </div>
            <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
              Order <OrderStatusBadge status={order.status} label={order.status_label} />
              <span className="ml-1">Payment</span> <OrderStatusBadge status={order.payment_status} label={order.payment_status_label} />
            </div>
            <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200" data-testid="drawer-items">
              {order.items.map((it) => (
                <li key={it.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                  <span className="h-9 w-9 shrink-0 overflow-hidden rounded-lg bg-slate-100">{it.image && <img src={it.image} alt="" className="h-full w-full object-cover" />}</span>
                  <span className="min-w-0 flex-1 truncate">{it.product_name} <span className="text-slate-400">× {it.quantity}</span></span>
                  <span className="font-medium tabular-nums">{formatPrice(it.line_total)}</span>
                </li>
              ))}
            </ul>
            <dl className="mt-2">
              <Field label="Subtotal">{formatPrice(order.subtotal)}</Field>
              <Field label={order.shipping_method_label || 'Shipping'}>{Number(order.shipping_cost) === 0 ? 'Free' : formatPrice(order.shipping_cost)}</Field>
              <Field label="Order total"><span className="text-base">{formatPrice(order.total_amount)}</span></Field>
            </dl>
            {order.address && (
              <p className="mt-2 rounded-xl bg-slate-50 p-3 text-sm text-slate-600">
                <span className="font-semibold text-slate-900">{order.address.recipient_name}</span> · {order.address.phone}<br />
                {order.address.street_address}, {order.address.city} {order.address.postal_code}, {order.address.country}
              </p>
            )}
          </section>

          <section aria-labelledby="pd-customer">
            <h3 id="pd-customer" className="mb-1 text-sm font-bold uppercase tracking-wide text-slate-500">Customer</h3>
            <dl className="divide-y divide-slate-100">
              <Field label="Name">
                {p.customer.is_staff ? (
                  p.customer.full_name || p.customer.username
                ) : (
                  <Link to={`/admin-dashboard/customers/${p.customer.id}`} className="text-brand-700 hover:underline" data-testid="drawer-customer">
                    {p.customer.full_name || p.customer.username}
                  </Link>
                )}
              </Field>
              <Field label="Email"><span className="break-all">{p.customer.email}</span></Field>
              <Field label="Phone">{p.customer.phone || '—'}</Field>
            </dl>
          </section>

          <section aria-labelledby="pd-attempts">
            <h3 id="pd-attempts" className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-500">Other attempts for this order</h3>
            {p.other_attempts.length === 0 ? (
              <p className="text-sm text-slate-500" data-testid="drawer-no-attempts">This was the only payment attempt.</p>
            ) : (
              <ul className="space-y-2" data-testid="drawer-attempts">
                {p.other_attempts.map((a) => (
                  <li key={a.id}>
                    <button type="button" onClick={() => onOpen(a.id)} className="flex w-full items-center justify-between gap-2 rounded-xl border border-slate-200 px-3 py-2 text-left text-sm hover:bg-slate-50">
                      <span className="min-w-0">
                        <span className="block truncate font-mono text-xs">{a.transaction_id}</span>
                        <span className="text-xs text-slate-500">{a.provider_label} · {dateTime(a.created_at)}</span>
                      </span>
                      <OrderStatusBadge status={a.status} label={a.status_label} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </Drawer>
  )
}

export default function AdminPaymentsPage() {
  const f = useUrlFilters([...KEYS, 'payment'])
  const { values, page, update } = f
  const query = { ...Object.fromEntries(KEYS.map((k) => [k, values[k]])), page }
  const { data, error, loading, reload } = useApiData(
    JSON.stringify(query),
    () => getAdminPayments(query),
    'Could not load payments.',
    (err) => {
      if (err.response?.status === 404 && page > 1) {
        update({ page: '' }) // that page no longer exists
        return true
      }
      return false
    },
  )
  const openId = values.payment
  const openPayment = (id) => update({ payment: id }, { resetPage: false })
  const closePayment = () => update({ payment: '' }, { resetPage: false })
  const hasFilters = Boolean(values.search || FILTERS.some((x) => x.key !== 'ordering' && values[x.key]))
  const s = data?.summary

  return (
    <div className="space-y-5">
      {s && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5" data-testid="payment-summary">
          <SummaryChip label="Received" value={formatPrice(s.succeeded.amount)} note={`${s.succeeded.count} succeeded`} tone="green" testId="sum-received" onClick={() => update({ status: values.status === 'succeeded' ? '' : 'succeeded' })} active={values.status === 'succeeded'} />
          <SummaryChip label="Pending" value={s.pending.count} note={formatPrice(s.pending.amount)} tone="sky" testId="sum-pending" onClick={() => update({ status: values.status === 'pending' ? '' : 'pending' })} active={values.status === 'pending'} />
          <SummaryChip label="Failed" value={s.failed.count} note="Not charged" tone="red" testId="sum-failed" onClick={() => update({ status: values.status === 'failed' ? '' : 'failed' })} active={values.status === 'failed'} />
          <SummaryChip label="Refunded" value={formatPrice(s.refunded.amount)} note={`${s.refunded.count} payments`} tone="amber" testId="sum-refunded" onClick={() => update({ status: values.status === 'refunded' ? '' : 'refunded' })} active={values.status === 'refunded'} />
          <SummaryChip label="Success rate" value={s.success_rate == null ? '—' : `${s.success_rate}%`} note={`${s.total} attempts`} testId="sum-rate" />
        </div>
      )}

      <section className={cardClass} aria-labelledby="payments-heading">
        <div className="space-y-3 border-b border-slate-200 p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="payments-heading" className="text-lg font-bold text-slate-900">
              Transactions {data && <span className="text-sm font-medium text-slate-500" data-testid="payment-count">({data.count.toLocaleString('en-US')} {hasFilters ? 'found' : 'total'})</span>}
            </h2>
            {hasFilters && (
              <button type="button" onClick={() => update({ search: '', status: '', method: '', provider: '', days: '' })} className="text-sm font-semibold text-brand-700 hover:underline">
                Clear filters
              </button>
            )}
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-6">
            <div className="sm:col-span-2 lg:col-span-1">
              <SearchBox id="payment-search" label="Search payments" value={values.search} onSearch={(v) => update({ search: v })} placeholder="Transaction, order #, customer…" />
            </div>
            {FILTERS.map((x) => (
              <FilterSelect key={x.key} id={`pay-${x.key}`} label={x.label} value={values[x.key]} options={x.options} onChange={(v) => update({ [x.key]: v })} />
            ))}
          </div>
        </div>

        {!data && loading ? (
          <ListSkeleton label="Loading payments" />
        ) : !data && error ? (
          <div className="p-5"><ErrorMessage message={error} onRetry={reload} /></div>
        ) : (
          <div className={`transition-opacity ${loading ? 'opacity-60' : ''}`} aria-busy={loading}>
            {error && <ErrorBanner message={error} onRetry={reload} />}
            {data.results.length === 0 ? (
              <EmptyState
                testId="payments-empty"
                title={hasFilters ? 'No payments match these filters' : 'No payments yet'}
                hint={hasFilters ? 'Try a different search or clear the filters.' : 'Every checkout attempt (card, bKash, Nagad, cash on delivery) appears here.'}
              />
            ) : (
              <>
                <div className="hidden overflow-x-auto lg:block">
                  <table className="w-full text-sm" data-testid="payments-table">
                    <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="px-5 py-3 font-semibold">Transaction</th>
                        <th className="px-3 py-3 font-semibold">Order</th>
                        <th className="px-3 py-3 font-semibold">Customer</th>
                        <th className="px-3 py-3 font-semibold">Method</th>
                        <th className="px-3 py-3 font-semibold">Date</th>
                        <th className="px-3 py-3 font-semibold">Status</th>
                        <th className="px-5 py-3 text-right font-semibold">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {data.results.map((p) => (
                        <tr key={p.id} className="cursor-pointer hover:bg-slate-50" onClick={() => openPayment(p.id)} data-testid="payment-row">
                          <td className="max-w-56 px-5 py-3">
                            <button type="button" onClick={(e) => { e.stopPropagation(); openPayment(p.id) }} className="block max-w-full truncate font-mono text-xs font-semibold text-brand-700 hover:underline" aria-label={`Payment ${p.id} details`}>
                              {p.transaction_id}
                            </button>
                            <span className="text-xs text-slate-500">{p.provider_label}</span>
                          </td>
                          <td className="px-3 py-3 font-semibold text-slate-900">#{p.order.id}</td>
                          <td className="px-3 py-3">
                            <p className="font-medium text-slate-900">{p.customer.full_name || p.customer.username}</p>
                            <p className="max-w-48 truncate text-xs text-slate-500">{p.customer.email}</p>
                          </td>
                          <td className="px-3 py-3"><PaymentMark code={p.method} size="sm" /></td>
                          <td className="whitespace-nowrap px-3 py-3 text-slate-600">{formatDate(p.created_at)}</td>
                          <td className="px-3 py-3"><OrderStatusBadge status={p.status} label={p.status_label} /></td>
                          <td className="whitespace-nowrap px-5 py-3 text-right font-semibold tabular-nums">{formatPrice(p.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <ul className="divide-y divide-slate-100 lg:hidden" data-testid="payments-cards">
                  {data.results.map((p) => (
                    <li key={p.id}>
                      <button type="button" onClick={() => openPayment(p.id)} className="flex w-full items-start gap-3 px-4 py-4 text-left hover:bg-slate-50">
                        <PaymentMark code={p.method} size="sm" />
                        <span className="min-w-0 flex-1">
                          <span className="flex items-start justify-between gap-2">
                            <span className="font-semibold tabular-nums text-slate-900">{formatPrice(p.amount)}</span>
                            <OrderStatusBadge status={p.status} label={p.status_label} />
                          </span>
                          <span className="block truncate font-mono text-xs text-slate-500">{p.transaction_id}</span>
                          <span className="mt-1 block text-xs text-slate-600">Order #{p.order.id} · {p.customer.username} · {formatDate(p.created_at)}</span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}
            <div className="px-4 pb-5">
              <Pagination page={page} totalPages={data ? Math.max(1, Math.ceil(data.count / PAGE_SIZE)) : 1} onChange={(p) => update({ page: p > 1 ? p : '' }, { resetPage: false })} />
            </div>
          </div>
        )}
      </section>

      {openId && <PaymentDrawer id={openId} onClose={closePayment} onOpen={openPayment} />}
    </div>
  )
}
