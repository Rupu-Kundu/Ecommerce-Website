import { useCallback, useEffect, useRef, useState } from 'react'
import { getErrorMessage } from '../services/api'
import { endConversation, getMessages, getMyConversation, getSupportStatus, sendMessage, startConversation } from '../services/supportService'

const STORAGE_KEY = 'haatbox-live-chat'
const FAST_POLL = 4000 // chat window open
const SLOW_POLL = 20000 // closed: only to show the "new reply" badge

function loadSession() {
  try {
    const s = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null')
    return s && Number.isInteger(s.id) ? { id: s.id, token: typeof s.token === 'string' ? s.token : null } : null
  } catch {
    return null
  }
}

function saveSession(session) {
  try {
    if (session) localStorage.setItem(STORAGE_KEY, JSON.stringify(session))
    else localStorage.removeItem(STORAGE_KEY)
  } catch {
    // storage unavailable — the chat still works until the page is closed
  }
}

function merge(current, incoming) {
  if (!incoming.length) return current
  const seen = new Set(current.map((m) => m.id))
  const fresh = incoming.filter((m) => !seen.has(m.id))
  return fresh.length ? [...current, ...fresh] : current
}

/**
 * Live chat with the Haatbox team. Polls for new messages: every few seconds while
 * the chat is on screen (`isActive(hasChat)` is true), slowly otherwise (for the unread badge).
 * Guests keep {id, token} in localStorage; logged-in customers also find their
 * open chat from the server, so it follows them to other devices.
 */
export default function useLiveChat({ isActive, user }) {
  const [session, setSession] = useState(loadSession)
  const active = isActive(Boolean(session))
  const [messages, setMessages] = useState([])
  const [status, setStatus] = useState(null)
  const [unread, setUnread] = useState(0)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [presence, setPresence] = useState({ teamOnline: null, autoReply: true })
  const lastId = useRef(0)
  const userId = user?.id ?? null

  const reset = useCallback(() => {
    saveSession(null)
    setSession(null)
    setMessages([])
    setStatus(null)
    setUnread(0)
    setError('')
    lastId.current = 0
  }, [])

  // Before a chat starts, show whether the team is online (or the AI will answer).
  useEffect(() => {
    if (session || !active) return undefined
    let cancelled = false
    getSupportStatus()
      .then((s) => !cancelled && setPresence({ teamOnline: s.team_online, autoReply: s.auto_reply }))
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [session, active])

  // A logged-in customer may already have an open chat (e.g. started on another device).
  useEffect(() => {
    if (session || !userId) return undefined
    let cancelled = false
    getMyConversation()
      .then((data) => {
        if (cancelled) return
        const s = { id: data.conversation.id, token: null }
        saveSession(s)
        setSession(s)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [session, userId])

  const poll = useCallback(async () => {
    if (!session) return
    try {
      const data = await getMessages(session.id, { token: session.token, after: lastId.current, seen: active })
      if (data.messages.length) lastId.current = data.messages[data.messages.length - 1].id
      setMessages((m) => merge(m, data.messages))
      setStatus(data.conversation.status)
      setUnread(data.unread)
      setPresence({ teamOnline: Boolean(data.team_online), autoReply: data.auto_reply !== false })
    } catch (err) {
      if (err.response?.status === 404) reset() // not ours any more (e.g. logged out) — start over
    }
  }, [session, active, reset])

  useEffect(() => {
    if (!session) return undefined
    poll()
    const id = setInterval(() => {
      if (!document.hidden) poll()
    }, active ? FAST_POLL : SLOW_POLL)
    return () => clearInterval(id)
  }, [session, active, poll])

  async function start({ message, name, transcript }) {
    setSending(true)
    setError('')
    try {
      const data = await startConversation({ message, name, transcript })
      const s = { id: data.conversation.id, token: data.token || session?.token || null }
      saveSession(s)
      lastId.current = data.messages.length ? data.messages[data.messages.length - 1].id : 0
      setMessages(data.messages)
      setStatus(data.conversation.status)
      setPresence({ teamOnline: data.team_online, autoReply: data.auto_reply })
      setSession(s)
      return true
    } catch (err) {
      setError(getErrorMessage(err, 'Could not start the chat. Please try again.'))
      return false
    } finally {
      setSending(false)
    }
  }

  async function send(text) {
    if (!session) return false
    setSending(true)
    setError('')
    try {
      const msg = await sendMessage(session.id, text, session.token)
      setMessages((m) => merge(m, [msg]))
      setStatus('open')
      poll() // an AI auto-reply may already be waiting
      return true
    } catch (err) {
      setError(getErrorMessage(err, 'Message not sent. Please try again.'))
      return false
    } finally {
      setSending(false)
    }
  }

  async function end() {
    if (!session) return
    try {
      await endConversation(session.id, session.token)
      await poll()
    } catch (err) {
      setError(getErrorMessage(err, 'Could not end the chat.'))
    }
  }

  return {
    hasChat: Boolean(session), messages, status, unread, sending, error, start, send, end, reset,
    teamOnline: presence.teamOnline, autoReply: presence.autoReply,
  }
}
