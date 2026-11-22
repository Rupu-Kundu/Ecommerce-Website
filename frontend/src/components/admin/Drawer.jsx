import { useEffect, useRef } from 'react'
import AdminIcon from './AdminIcon'

/**
 * Side panel for details (payment, order). Full width on phones, 32rem from the right on
 * larger screens. Closes on Esc, the × button or a click on the backdrop; focus moves into
 * the panel and the page behind does not scroll.
 */
export default function Drawer({ open, title, subtitle, onClose, children, footer, testId = 'drawer' }) {
  const closeRef = useRef(null)
  // Keep the latest onClose without re-running the open/close effect (which moves focus).
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  })

  useEffect(() => {
    if (!open) return undefined
    const previous = document.activeElement
    closeRef.current?.focus()
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e) => e.key === 'Escape' && onCloseRef.current()
    document.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = overflow
      document.removeEventListener('keydown', onKey)
      previous?.focus?.()
    }
  }, [open])

  if (!open) return null
  return (
    <div className="fixed inset-0 z-50">
      <button type="button" aria-label="Close details" tabIndex={-1} className="absolute inset-0 h-full w-full bg-slate-900/40" onClick={onClose} />
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="drawer-title"
        className="absolute inset-y-0 right-0 flex w-full max-w-lg flex-col bg-white shadow-2xl"
        data-testid={testId}
      >
        <header className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
          <div className="min-w-0">
            <h2 id="drawer-title" className="truncate text-lg font-bold text-slate-900">{title}</h2>
            {subtitle && <div className="mt-0.5 text-sm text-slate-500">{subtitle}</div>}
          </div>
          <button ref={closeRef} type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100">
            <AdminIcon name="close" />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">{children}</div>
        {footer && <footer className="border-t border-slate-200 px-5 py-4">{footer}</footer>}
      </aside>
    </div>
  )
}
