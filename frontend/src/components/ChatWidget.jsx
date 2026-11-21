import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import useAuth from '../context/useAuth'
import useCart from '../context/useCart'
import { getErrorMessage } from '../services/api'
import { getChatConfig, sendChat } from '../services/chatService'
import ChatMessageText from './ChatMessageText'

const STORAGE_KEY = 'haatbox-chat'
const MAX_STORED = 30

const SUGGESTIONS = [
  'Gift ideas under ৳2,000',
  'Show me running shoes',
  'How much is delivery?',
  'আমার অর্ডার কোথায়?',
]

// The conversation is kept for this browser tab only (sessionStorage).
function loadMessages() {
  try {
    const saved = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || '[]')
    return Array.isArray(saved) ? saved.filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string') : []
  } catch {
    return []
  }
}

function saveMessages(messages) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-MAX_STORED)))
  } catch {
    // storage unavailable — the chat still works, it just won't survive a reload
  }
}

export default function ChatWidget() {
  const { user } = useAuth()
  const { refreshCart } = useCart()
  const [open, setOpen] = useState(false)
  const [enabled, setEnabled] = useState(null) // null = not checked yet
  const [messages, setMessages] = useState(loadMessages)
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const listRef = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => saveMessages(messages), [messages])

  // Ask the server once (when first opened) whether the assistant is configured.
  useEffect(() => {
    if (!open || enabled !== null) return
    getChatConfig()
      .then((c) => setEnabled(Boolean(c.enabled)))
      .catch(() => setEnabled(false))
  }, [open, enabled])

  useEffect(() => {
    if (!open) return undefined
    inputRef.current?.focus()
    const onKey = (e) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, sending, open])

  async function send(text, base = messages) {
    const content = text.trim()
    if (!content || sending) return
    setError('')
    const next = [...base, { role: 'user', content }]
    setMessages(next)
    setInput('')
    setSending(true)
    try {
      const data = await sendChat(next.slice(-20))
      setMessages((m) => [...m, { role: 'assistant', content: data.reply }])
      if (data.cart_updated) refreshCart().catch(() => {})
    } catch (err) {
      if (err.response?.status === 503) setEnabled(false)
      setError(getErrorMessage(err, 'The assistant could not answer. Please try again.'))
    } finally {
      setSending(false)
    }
  }

  // Re-send the last question that failed (without adding it to the conversation twice).
  function retry() {
    const index = messages.map((m) => m.role).lastIndexOf('user')
    if (index === -1) return
    send(messages[index].content, messages.slice(0, index))
  }

  function clear() {
    setMessages([])
    setError('')
  }

  return (
    <>
      {/* Launcher */}
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open shopping assistant"
          className="fixed bottom-5 right-5 z-40 flex items-center gap-2 rounded-full bg-brand-700 py-3 pl-4 pr-5 font-semibold text-white shadow-xl shadow-brand-900/30 transition hover:-translate-y-0.5 hover:bg-brand-800"
        >
          <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M21 12c0 4.418-4.03 8-9 8a9.86 9.86 0 0 1-4-.83L3 20l1.4-3.72A7.6 7.6 0 0 1 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8Z" />
          </svg>
          <span className="hidden sm:inline">Ask Haatbox AI</span>
        </button>
      )}

      {/* Panel */}
      {open && (
        <section
          role="dialog"
          aria-label="Haatbox shopping assistant"
          className="fixed inset-x-0 bottom-0 z-50 flex h-[85vh] flex-col overflow-hidden rounded-t-3xl border border-slate-200 bg-white shadow-2xl sm:inset-x-auto sm:bottom-5 sm:right-5 sm:h-150 sm:max-h-[calc(100vh-2.5rem)] sm:w-100 sm:rounded-3xl"
        >
          <header className="flex items-center justify-between bg-linear-to-r from-brand-800 to-brand-600 px-4 py-3 text-white">
            <div className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white/15 text-lg" aria-hidden="true">✦</span>
              <div>
                <p className="text-sm font-bold leading-tight">Haatbox Assistant</p>
                <p className="text-[11px] text-brand-100">AI · English &amp; বাংলা</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              {messages.length > 0 && (
                <button type="button" onClick={clear} className="rounded-full px-2.5 py-1 text-xs font-semibold text-brand-50 hover:bg-white/15">
                  New chat
                </button>
              )}
              <button type="button" onClick={() => setOpen(false)} aria-label="Close assistant" className="rounded-full p-2 hover:bg-white/15">
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M6 18 18 6M6 6l12 12" /></svg>
              </button>
            </div>
          </header>

          <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto bg-slate-50 px-4 py-4 text-sm" aria-live="polite">
            {enabled === false ? (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-900" data-testid="chat-offline">
                <p className="font-semibold">The AI assistant is offline right now.</p>
                <p className="mt-1">Browse <Link to="/products" className="underline">all products</Link> or visit the <Link to="/help" className="underline">Help center</Link>.</p>
              </div>
            ) : (
              <>
                <div className="max-w-[85%] rounded-2xl rounded-tl-md bg-white px-3.5 py-2.5 text-slate-800 shadow-sm ring-1 ring-slate-100">
                  Hi{user ? ` ${user.username}` : ''}! 👋 I can find products, compare prices, answer delivery & payment questions{user ? ', check your orders and add things to your cart' : ''}. Ask in English or বাংলা.
                </div>
                {messages.length === 0 && (
                  <div className="flex flex-wrap gap-2 pt-1">
                    {SUGGESTIONS.map((s) => (
                      <button key={s} type="button" onClick={() => send(s)} className="rounded-full border border-brand-200 bg-white px-3 py-1.5 text-xs font-medium text-brand-800 hover:bg-brand-50">
                        {s}
                      </button>
                    ))}
                  </div>
                )}
                {messages.map((m, i) =>
                  m.role === 'user' ? (
                    <div key={i} className="ml-auto max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-tr-md bg-brand-700 px-3.5 py-2.5 text-white" data-testid="chat-user">
                      {m.content}
                    </div>
                  ) : (
                    <div key={i} className="max-w-[90%] rounded-2xl rounded-tl-md bg-white px-3.5 py-2.5 leading-relaxed text-slate-800 shadow-sm ring-1 ring-slate-100" data-testid="chat-assistant">
                      <ChatMessageText text={m.content} />
                    </div>
                  ),
                )}
                {sending && (
                  <div className="flex w-16 items-center justify-center gap-1 rounded-2xl bg-white px-3 py-3 shadow-sm ring-1 ring-slate-100" role="status" aria-label="Assistant is typing">
                    {[0, 150, 300].map((d) => (
                      <span key={d} className="h-1.5 w-1.5 animate-bounce rounded-full bg-brand-500" style={{ animationDelay: `${d}ms` }} />
                    ))}
                  </div>
                )}
                {error && (
                  <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-red-700">
                    {error}{' '}
                    {enabled !== false && <button type="button" onClick={retry} className="font-semibold underline">Try again</button>}
                  </div>
                )}
              </>
            )}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault()
              send(input)
            }}
            className="flex items-end gap-2 border-t border-slate-200 bg-white p-3"
          >
            <label htmlFor="chat-input" className="sr-only">Message</label>
            <textarea
              id="chat-input"
              ref={inputRef}
              rows={1}
              maxLength={2000}
              value={input}
              disabled={enabled === false}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  send(input)
                }
              }}
              placeholder={enabled === false ? 'Assistant offline' : 'Ask about products, delivery, orders…'}
              className="max-h-28 min-h-10.5 flex-1 resize-none rounded-2xl border border-slate-300 px-3.5 py-2.5 text-sm outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100 disabled:bg-slate-100"
            />
            <button
              type="submit"
              disabled={!input.trim() || sending || enabled === false}
              aria-label="Send message"
              className="flex h-10.5 w-10.5 shrink-0 items-center justify-center rounded-full bg-brand-700 text-white transition hover:bg-brand-800 disabled:bg-slate-300"
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M13 6l6 6-6 6" /></svg>
            </button>
          </form>
          <p className="bg-white pb-2 text-center text-[10px] text-slate-400">AI can make mistakes — check prices and stock on the product page.</p>
        </section>
      )}
    </>
  )
}
