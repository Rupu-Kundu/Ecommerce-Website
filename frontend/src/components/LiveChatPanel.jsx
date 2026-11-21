import { useEffect, useRef, useState } from 'react'
import ChatMessageText from './ChatMessageText'

const time = (iso) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

function Bubble({ m }) {
  if (m.sender === 'system') {
    return <p className="px-4 text-center text-[11px] text-slate-400" data-testid="live-system">{m.text}</p>
  }
  if (m.sender === 'customer') {
    return (
      <div className="ml-auto max-w-[85%]" data-testid="live-customer">
        <div className="whitespace-pre-wrap rounded-2xl rounded-tr-md bg-brand-700 px-3.5 py-2.5 text-white">{m.text}</div>
        <p className="mt-0.5 text-right text-[10px] text-slate-400">{time(m.created_at)}</p>
      </div>
    )
  }
  const ai = m.sender === 'assistant'
  return (
    <div className="max-w-[90%]" data-testid={ai ? 'live-assistant' : 'live-agent'}>
      <p className="mb-0.5 text-[11px] font-semibold text-slate-500">{ai ? (m.is_auto_reply ? '✦ AI assistant · auto-reply' : 'AI assistant') : m.sender_label}</p>
      <div className={`rounded-2xl rounded-tl-md px-3.5 py-2.5 leading-relaxed shadow-sm ring-1 ${ai ? 'bg-slate-100 text-slate-600 ring-slate-200' : 'bg-white text-slate-800 ring-brand-100'}`}>
        {ai ? <ChatMessageText text={m.text} /> : <span className="whitespace-pre-wrap">{m.text}</span>}
      </div>
      <p className="mt-0.5 text-[10px] text-slate-400">{time(m.created_at)}</p>
    </div>
  )
}

/**
 * The "Chat with our team" side of the chat window.
 * chat = useLiveChat(...) result; transcript = the AI chat so far (offered to share at hand-off).
 */
export default function LiveChatPanel({ chat, user, transcript, aiOffline }) {
  const [text, setText] = useState('')
  const [name, setName] = useState('')
  const [share, setShare] = useState(true)
  const listRef = useRef(null)
  const inputRef = useRef(null)

  // Jump to the newest message (instant: replies can arrive back-to-back, which interrupts smooth scrolling).
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight })
  }, [chat.messages.length])

  useEffect(() => {
    inputRef.current?.focus()
  }, [chat.hasChat])

  async function submit(e) {
    e?.preventDefault()
    const content = text.trim()
    if (!content || chat.sending) return
    const ok = chat.hasChat
      ? await chat.send(content)
      : await chat.start({
          message: content,
          name: user ? undefined : name.trim() || undefined,
          transcript: share && transcript.length ? transcript.slice(-20) : undefined,
        })
    if (ok) setText('')
  }

  const closed = chat.status === 'closed'

  return (
    <>
      <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto bg-slate-50 px-4 py-4 text-sm" aria-live="polite" data-testid="live-chat">
        {!chat.hasChat ? (
          <div className="space-y-3">
            {aiOffline && (
              <p className="rounded-2xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-amber-900" data-testid="chat-offline">
                The AI assistant is offline right now — our team is happy to help instead.
              </p>
            )}
            <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-100">
              <p className="font-semibold text-slate-900">Chat with the Haatbox team 👋</p>
              <p className="mt-1 text-slate-600" data-testid="live-presence">
                {chat.teamOnline === null
                  ? 'Real people, Sat–Thu 9 AM – 9 PM.'
                  : chat.teamOnline
                  ? 'Our team is online now and usually replies within a few minutes.'
                  : chat.autoReply
                    ? "Our team is away right now. The AI assistant will answer straight away, and a person will follow up (Sat–Thu, 9 AM – 9 PM)."
                    : "Our team is away right now (Sat–Thu, 9 AM – 9 PM). Leave a message and we'll reply as soon as we're back."}
              </p>
            </div>
            {!user && (
              <div>
                <label htmlFor="live-name" className="mb-1 block text-xs font-semibold text-slate-600">Your name (optional)</label>
                <input
                  id="live-name"
                  value={name}
                  maxLength={80}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100"
                />
              </div>
            )}
            {transcript.length > 0 && (
              <label className="flex items-start gap-2 text-xs text-slate-600">
                <input type="checkbox" checked={share} onChange={(e) => setShare(e.target.checked)} className="mt-0.5" />
                Share my chat with the AI assistant so I don't have to repeat myself
              </label>
            )}
            <p className="text-xs text-slate-500">Please don't send card numbers, PINs or OTPs.</p>
          </div>
        ) : (
          <>
            {chat.messages.map((m) => <Bubble key={m.id} m={m} />)}
            {closed && (
              <div className="rounded-2xl border border-slate-200 bg-white px-3.5 py-2.5 text-center text-slate-600" data-testid="live-closed">
                This chat has ended. Write below to reopen it, or{' '}
                <button type="button" onClick={chat.reset} className="font-semibold text-brand-700 underline">start a new chat</button>.
              </div>
            )}
          </>
        )}
        {chat.error && <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-red-700">{chat.error}</div>}
      </div>

      <form onSubmit={submit} className="flex items-end gap-2 border-t border-slate-200 bg-white p-3">
        <label htmlFor="live-input" className="sr-only">Message to our team</label>
        <textarea
          id="live-input"
          ref={inputRef}
          rows={1}
          maxLength={2000}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              submit()
            }
          }}
          placeholder={chat.hasChat ? 'Write a message…' : 'How can we help?'}
          className="max-h-28 min-h-10.5 flex-1 resize-none rounded-2xl border border-slate-300 px-3.5 py-2.5 text-sm outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100"
        />
        <button
          type="submit"
          disabled={!text.trim() || chat.sending}
          aria-label={chat.hasChat ? 'Send to our team' : 'Start chat'}
          className="flex h-10.5 shrink-0 items-center justify-center rounded-full bg-brand-700 px-4 text-sm font-semibold text-white transition hover:bg-brand-800 disabled:bg-slate-300"
        >
          {chat.hasChat ? 'Send' : 'Start chat'}
        </button>
      </form>
    </>
  )
}
