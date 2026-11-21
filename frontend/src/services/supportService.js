import api from './api'

// Guests prove they own a conversation with this header (logged-in users use their JWT).
const withToken = (token) => (token ? { headers: { 'X-Support-Token': token } } : {})

// ---- Customer ----

/** Is the team online right now, and will the AI auto-reply while they're away? → {team_online, auto_reply} */
export async function getSupportStatus() {
  const { data } = await api.get('/support/status/')
  return data
}

/** Start (or, when logged in, continue) a live chat. → {conversation, messages, token?} */
export async function startConversation({ message, name, transcript }) {
  const { data } = await api.post('/support/conversations/', { message, name, transcript })
  return data
}

/** The logged-in customer's open conversation. → {conversation, unread} (404 when none) */
export async function getMyConversation() {
  const { data } = await api.get('/support/conversations/mine/')
  return data
}

/** New messages after `after`. seen=true marks the team's replies as read. → {conversation, messages, unread} */
export async function getMessages(id, { token, after = 0, seen = false } = {}) {
  const { data } = await api.get(`/support/conversations/${id}/messages/`, {
    params: { after, ...(seen ? { seen: 1 } : {}) },
    ...withToken(token),
  })
  return data
}

export async function sendMessage(id, text, token) {
  const { data } = await api.post(`/support/conversations/${id}/messages/`, { text }, withToken(token))
  return data
}

export async function endConversation(id, token) {
  const { data } = await api.post(`/support/conversations/${id}/close/`, null, withToken(token))
  return data
}

// ---- Admin (Haatbox team) ----

export async function getSupportSummary() {
  const { data } = await api.get('/support/admin/summary/')
  return data
}

export async function listConversations(status = 'open') {
  const { data } = await api.get('/support/admin/conversations/', { params: { status } })
  return data
}

export async function getAdminMessages(id, after = 0) {
  const { data } = await api.get(`/support/admin/conversations/${id}/messages/`, { params: { after } })
  return data
}

export async function replyToConversation(id, text) {
  const { data } = await api.post(`/support/admin/conversations/${id}/messages/`, { text })
  return data
}

export async function setConversationStatus(id, status) {
  const { data } = await api.patch(`/support/admin/conversations/${id}/`, { status })
  return data
}

export async function setConversationAutoReply(id, enabled) {
  const { data } = await api.patch(`/support/admin/conversations/${id}/`, { ai_auto_reply: enabled })
  return data
}
