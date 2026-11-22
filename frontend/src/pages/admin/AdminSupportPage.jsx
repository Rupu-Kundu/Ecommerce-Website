import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import ChatMessageText from '../../components/ChatMessageText'
import { getErrorMessage } from '../../services/api'
import { getAdminMessages, listConversations, replyToConversation, setConversationAutoReply, setConversationStatus } from '../../services/supportService'

const LIST_POLL = 5000
const THREAD_POLL = 3000
const FILTERS = [
  { value: 'open', label: 'Open' },
  { value: 'closed', label: 'Closed' },
  { value: 'all', label: 'All' },
]

function ago(iso) {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} min ago`
  const hours = Math.round(mins / 60)
  return hours < 24 ? `${hours} h ago` : new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}
const time = (iso) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

function useVisibleInterval(fn, ms, enabled = true) {
  useEffect(() => {
    if (!enabled) return undefined
    fn()
    const id = setInterval(() => !document.hidden && fn(), ms)
    return () => clearInterval(id)
  }, [fn, ms, enabled])
}

function Thread({ id, onBack, onChanged }) {
  const [conversation, setConversation] = useState(null)
  const [messages, setMessages] = useState([])
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const lastId = useRef(0)
  const listRef = useRef(null)

  const load = useCallback(async () => {
    try {
      const data = await getAdminMessages(id, lastId.current)
      setConversation(data.conversation)
      if (data.messages.length) {
        lastId.current = data.messages[data.messages.length - 1].id
        setMessages((m) => {
          const seen = new Set(m.map((x) => x.id))
          return [...m, ...data.messages.filter((x) => !seen.has(x.id))]
        })
      }
    } catch (err) {
      setError(getErrorMessage(err, 'Could not load this chat.'))
    }
  }, [id])

  useVisibleInterval(load, THREAD_POLL)

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight })
  }, [messages.length])

  async function reply(e) {
    e?.preventDefault()
    const content = text.trim()
    if (!content || busy) return
    setBusy(true)
    setError('')
    try {
      await replyToConversation(id, content)
      setText('')
      await load()
      onChanged()
    } catch (err) {
      setError(getErrorMessage(err, 'Reply not sent.'))
    } finally {
      setBusy(false)
    }
  }

  async function toggleStatus() {
    setBusy(true)
    try {
      await setConversationStatus(id, conversation.status === 'open' ? 'closed' : 'open')
      await load()
      onChanged()
    } catch (err) {
      setError(getErrorMessage(err, 'Could not update the chat.'))
    } finally {
      setBusy(false)
    }
  }

  async function toggleAutoReply() {
    setBusy(true)
    try {
      await setConversationAutoReply(id, !conversation.ai_auto_reply)
      await load()
    } catch (err) {
      setError(getErrorMessage(err, 'Could not change auto-reply.'))
    } finally {
      setBusy(false)
    }
  }

  if (!conversation) {
    return <div className="flex flex-1 items-center justify-center p-8 text-sm text-slate-500">{error || 'Loading chat…'}</div>
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="admin-thread">
      <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <button type="button" onClick={onBack} className="rounded-full px-2 py-1 text-sm font-semibold text-brand-700 hover:bg-brand-50 lg:hidden" aria-label="All chats">←</button>
          <div className="min-w-0">
            <p className="truncate font-semibold text-slate-900">
              {conversation.customer.label}
              {conversation.customer.guest && <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">Guest</span>}
            </p>
            <p className="truncate text-xs text-slate-500">
              Chat #{conversation.id}{conversation.customer.email ? ` · ${conversation.customer.email}` : ''}{conversation.from_assistant ? ' · handed over by AI' : ''}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
          <button
            type="button"
            onClick={toggleAutoReply}
            disabled={busy}
            aria-pressed={conversation.ai_auto_reply}
            title="When on, the AI answers if nobody from the team replies in time"
            className={`rounded-full border px-3 py-1.5 text-xs font-semibold disabled:opacity-60 ${conversation.ai_auto_reply ? 'border-brand-300 bg-brand-50 text-brand-800' : 'border-slate-300 text-slate-500'}`}
          >
            AI auto-reply: {conversation.ai_auto_reply ? 'On' : 'Off'}
          </button>
          <button
            type="button"
            onClick={toggleStatus}
            disabled={busy}
            className="rounded-full border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
          >
            {conversation.status === 'open' ? 'Close chat' : 'Reopen'}
          </button>
        </div>
      </div>

      <div ref={listRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-slate-50 px-4 py-4 text-sm">
        {messages.map((m) => {
          if (m.sender === 'system') return <p key={m.id} className="text-center text-[11px] text-slate-400">{m.text}</p>
          const mine = m.sender === 'agent'
          const ai = m.sender === 'assistant'
          return (
            <div key={m.id} className={`max-w-[85%] ${mine ? 'ml-auto text-right' : ''}`} data-testid={`admin-msg-${m.sender}`}>
              <p className="mb-0.5 text-[11px] font-semibold text-slate-500">
                {mine ? `You${m.author ? ` (${m.author})` : ''}` : ai ? (m.is_auto_reply ? 'AI auto-reply' : 'AI assistant') : conversation.customer.label} · {time(m.created_at)}
              </p>
              <div className={`inline-block rounded-2xl px-3.5 py-2.5 text-left ${mine ? 'rounded-tr-md bg-brand-700 text-white' : ai ? 'rounded-tl-md bg-slate-100 text-slate-600 ring-1 ring-slate-200' : 'rounded-tl-md bg-white text-slate-800 shadow-sm ring-1 ring-slate-100'}`}>
                {ai ? <ChatMessageText text={m.text} /> : <span className="whitespace-pre-wrap">{m.text}</span>}
              </div>
            </div>
          )
        })}
      </div>

      {error && <p role="alert" className="border-t border-red-100 bg-red-50 px-4 py-2 text-sm text-red-700">{error}</p>}
      <form onSubmit={reply} className="flex items-end gap-2 border-t border-slate-200 bg-white p-3">
        <label htmlFor="admin-reply" className="sr-only">Reply</label>
        <textarea
          id="admin-reply"
          rows={2}
          maxLength={2000}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              reply()
            }
          }}
          placeholder={conversation.status === 'closed' ? 'Reply to reopen this chat…' : 'Write a reply… (Enter to send, Shift+Enter for a new line)'}
          className="min-h-10.5 flex-1 resize-none rounded-2xl border border-slate-300 px-3.5 py-2.5 text-sm outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100"
        />
        <button type="submit" disabled={!text.trim() || busy} className="h-10.5 shrink-0 rounded-full bg-brand-700 px-5 text-sm font-semibold text-white hover:bg-brand-800 disabled:bg-slate-300">
          Send
        </button>
      </form>
    </div>
  )
}

export default function AdminSupportPage() {
  const [params, setParams] = useSearchParams()
  const filter = params.get('status') || 'open'
  const selected = Number(params.get('chat')) || null
  const [conversations, setConversations] = useState([])
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState('')

  const loadList = useCallback(async () => {
    try {
      setConversations(await listConversations(filter))
      setError('')
    } catch (err) {
      setError(getErrorMessage(err, 'Could not load chats.'))
    } finally {
      setLoaded(true)
    }
  }, [filter])

  useVisibleInterval(loadList, LIST_POLL)

  const update = (changes) => {
    const next = new URLSearchParams(params)
    Object.entries(changes).forEach(([k, v]) => (v ? next.set(k, v) : next.delete(k)))
    setParams(next, { replace: true })
  }

  return (
    <div className="flex h-[calc(100vh-8.5rem)] min-h-[28rem] lg:h-[calc(100vh-10rem)] overflow-hidden rounded-2xl border border-slate-200 bg-white">
      {/* Conversation list */}
      <aside className={`w-full flex-col border-r border-slate-200 lg:flex lg:w-80 ${selected ? 'hidden' : 'flex'}`} aria-label="Conversations">
        <div className="flex items-center justify-between gap-2 border-b border-slate-200 px-4 py-3">
          <h2 className="font-bold text-slate-900">Live chat</h2>
          <div className="flex gap-1 rounded-full bg-slate-100 p-0.5">
            {FILTERS.map((f) => (
              <button
                key={f.value}
                type="button"
                onClick={() => update({ status: f.value === 'open' ? null : f.value, chat: null })}
                className={`rounded-full px-2.5 py-1 text-xs font-semibold ${filter === f.value ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'}`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
        <ul className="min-h-0 flex-1 divide-y divide-slate-100 overflow-y-auto">
          {error && <li className="p-4 text-sm text-red-700">{error}</li>}
          {loaded && !error && conversations.length === 0 && (
            <li className="p-6 text-center text-sm text-slate-500">No {filter === 'all' ? '' : filter} chats right now.</li>
          )}
          {conversations.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => update({ chat: String(c.id) })}
                className={`flex w-full gap-3 px-4 py-3 text-left hover:bg-slate-50 ${selected === c.id ? 'bg-brand-50' : ''}`}
                data-testid="admin-chat-row"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-100 text-sm font-bold text-brand-800">
                  {c.customer.label.slice(0, 1).toUpperCase()}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-semibold text-slate-900">
                      {c.customer.label}{c.customer.guest && <span className="font-normal text-slate-500"> · guest</span>}
                    </span>
                    <span className="shrink-0 text-[11px] text-slate-400">{ago(c.last_message_at)}</span>
                  </span>
                  <span className="flex items-center justify-between gap-2">
                    <span className="truncate text-xs text-slate-500">
                      {c.last_message?.sender === 'agent' && 'You: '}{c.last_message?.text}
                    </span>
                    {c.unread > 0 && (
                      <span className="shrink-0 rounded-full bg-red-500 px-1.5 text-[11px] font-bold text-white" data-testid="admin-chat-unread">{c.unread}</span>
                    )}
                  </span>
                  {(c.from_assistant || c.status === 'closed') && (
                    <span className="mt-1 flex gap-1">
                      {c.from_assistant && <span className="rounded-full bg-accent-300/40 px-1.5 text-[10px] font-semibold text-amber-900">from AI</span>}
                      {c.status === 'closed' && <span className="rounded-full bg-slate-100 px-1.5 text-[10px] font-semibold text-slate-600">closed</span>}
                    </span>
                  )}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </aside>

      {/* Selected conversation */}
      <section className={`min-w-0 flex-1 flex-col ${selected ? 'flex' : 'hidden lg:flex'}`} aria-label="Conversation">
        {selected ? (
          <Thread key={selected} id={selected} onBack={() => update({ chat: null })} onChanged={loadList} />
        ) : (
          <div className="flex flex-1 items-center justify-center p-8 text-center text-sm text-slate-500">
            Choose a chat to read and reply.<br />New messages appear automatically.
          </div>
        )}
      </section>
    </div>
  )
}
