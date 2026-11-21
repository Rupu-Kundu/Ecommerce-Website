import api from './api'

/** {enabled: boolean} — whether the AI assistant is configured on the server. */
export async function getChatConfig() {
  const { data } = await api.get('/chat/config/')
  return data
}

/**
 * Send the conversation (plain text turns) and get the assistant's reply.
 * messages: [{role: 'user' | 'assistant', content: string}, ...] ending with the user's message.
 * → {reply, cart_updated}
 */
export async function sendChat(messages) {
  const { data } = await api.post('/chat/', { messages }, { timeout: 90000 })
  return data
}
