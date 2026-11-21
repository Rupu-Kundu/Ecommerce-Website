import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthContext } from '../context/authContext'
import { CartContext } from '../context/cartContext'
import { getChatConfig, sendChat } from '../services/chatService'
import { getMessages, getMyConversation, startConversation } from '../services/supportService'
import ChatMessageText from './ChatMessageText'
import ChatWidget from './ChatWidget'

vi.mock('../services/chatService', () => ({ getChatConfig: vi.fn(), sendChat: vi.fn() }))
vi.mock('../services/supportService', () => ({
  startConversation: vi.fn(),
  getMyConversation: vi.fn(),
  getMessages: vi.fn(),
  sendMessage: vi.fn(),
  endConversation: vi.fn(),
  getSupportStatus: vi.fn(() => Promise.resolve({ team_online: false, auto_reply: true })),
}))

describe('ChatMessageText (safe Markdown)', () => {
  it('renders internal links, bold text and lists', () => {
    render(
      <MemoryRouter>
        <ChatMessageText text={'Try these:\n\n- [Yoga Mat 6mm](/products/27) — **৳1,850**\n- [Football](/products/29)'} />
      </MemoryRouter>,
    )
    expect(screen.getByRole('link', { name: 'Yoga Mat 6mm' })).toHaveAttribute('href', '/products/27')
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
    expect(screen.getByText('৳1,850').tagName).toBe('STRONG')
  })

  it('never makes external links clickable and never renders HTML', () => {
    render(
      <MemoryRouter>
        <ChatMessageText text={'[Free prize](https://evil.example) <img src=x onerror=alert(1)> [x](//evil.example)'} />
      </MemoryRouter>,
    )
    expect(screen.queryAllByRole('link')).toHaveLength(0)
    expect(screen.getByText(/Free prize/)).toBeInTheDocument()
    expect(document.querySelector('img')).toBeNull()
  })
})

function renderWidget({ user = null, refreshCart = vi.fn().mockResolvedValue({}) } = {}) {
  render(
    <AuthContext.Provider value={{ user, isAuthenticated: Boolean(user) }}>
      <CartContext.Provider value={{ refreshCart }}>
        <MemoryRouter>
          <ChatWidget />
        </MemoryRouter>
      </CartContext.Provider>
    </AuthContext.Provider>,
  )
  return { refreshCart }
}

describe('ChatWidget', () => {
  beforeEach(() => {
    sessionStorage.clear()
    localStorage.clear()
    vi.mocked(getChatConfig).mockReset()
    vi.mocked(sendChat).mockReset()
    vi.mocked(startConversation).mockReset()
    vi.mocked(getMessages).mockReset()
    vi.mocked(getMyConversation).mockReset().mockRejectedValue({ response: { status: 404 } })
    Element.prototype.scrollTo = () => {}
  })

  it('falls back to the team live chat when the AI is not configured', async () => {
    vi.mocked(getChatConfig).mockResolvedValue({ enabled: false })
    renderWidget()
    fireEvent.click(screen.getByRole('button', { name: 'Open shopping assistant' }))
    expect(await screen.findByTestId('chat-offline')).toHaveTextContent('offline')
    expect(screen.getByRole('dialog', { name: 'Chat with the Haatbox team' })).toBeInTheDocument()
    expect(screen.getByLabelText('Message to our team')).toBeEnabled()
    expect(screen.queryByRole('button', { name: 'Ask AI' })).toBeNull() // no way back to an offline AI
  })

  it('guest starts a live chat; the token is kept for this browser', async () => {
    vi.mocked(getChatConfig).mockResolvedValue({ enabled: false })
    vi.mocked(startConversation).mockResolvedValue({
      conversation: { id: 7, status: 'open' },
      messages: [{ id: 1, sender: 'customer', sender_label: 'Customer', text: 'Where is my order?', created_at: '2026-11-22T10:00:00Z' }],
      token: 'secret-token',
    })
    vi.mocked(getMessages).mockResolvedValue({
      conversation: { id: 7, status: 'open' },
      messages: [{ id: 2, sender: 'agent', sender_label: 'Nila · Haatbox team', text: 'Hi! Checking now.', created_at: '2026-11-22T10:01:00Z' }],
      unread: 0,
      team_online: false,
      auto_reply: true,
    })
    renderWidget()
    fireEvent.click(screen.getByRole('button', { name: 'Open shopping assistant' }))
    fireEvent.change(await screen.findByLabelText('Your name (optional)'), { target: { value: 'Mina' } })
    fireEvent.change(screen.getByLabelText('Message to our team'), { target: { value: 'Where is my order?' } })
    fireEvent.click(screen.getByRole('button', { name: 'Start chat' }))
    expect(await screen.findByText('Hi! Checking now.')).toBeInTheDocument()
    expect(startConversation).toHaveBeenCalledWith({ message: 'Where is my order?', name: 'Mina', transcript: undefined })
    expect(screen.getByText('Nila · Haatbox team')).toBeInTheDocument()
    expect(screen.getByTestId('chat-subtitle')).toHaveTextContent('Team away · AI is replying')
    expect(JSON.parse(localStorage.getItem('haatbox-live-chat'))).toEqual({ id: 7, token: 'secret-token' })
    expect(getMessages).toHaveBeenCalledWith(7, expect.objectContaining({ token: 'secret-token', seen: true }))
  })

  it('AI hands off to a person and shares the conversation', async () => {
    vi.mocked(getChatConfig).mockResolvedValue({ enabled: true })
    vi.mocked(sendChat).mockResolvedValue({ reply: 'Sorry! Tap the button to talk to our team.', cart_updated: false, handoff: true })
    vi.mocked(startConversation).mockResolvedValue({ conversation: { id: 3, status: 'open' }, messages: [], token: 't' })
    vi.mocked(getMessages).mockResolvedValue({ conversation: { id: 3, status: 'open' }, messages: [], unread: 0 })
    renderWidget()
    fireEvent.click(screen.getByRole('button', { name: 'Open shopping assistant' }))
    fireEvent.change(await screen.findByLabelText('Message'), { target: { value: 'my mat is torn' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }))
    fireEvent.click(await screen.findByRole('button', { name: /Chat with our team/ }))
    expect(screen.getByLabelText(/Share my chat with the AI assistant/)).toBeChecked()
    fireEvent.change(screen.getByLabelText('Message to our team'), { target: { value: 'please help' } })
    fireEvent.click(screen.getByRole('button', { name: 'Start chat' }))
    await waitFor(() => expect(startConversation).toHaveBeenCalled())
    expect(vi.mocked(startConversation).mock.calls[0][0].transcript).toEqual([
      { role: 'user', content: 'my mat is torn' },
      { role: 'assistant', content: 'Sorry! Tap the button to talk to our team.' },
    ])
  })

  it('shows a badge for new team replies while the chat is closed', async () => {
    localStorage.setItem('haatbox-live-chat', JSON.stringify({ id: 9, token: 'tok' }))
    vi.mocked(getMessages).mockResolvedValue({ conversation: { id: 9, status: 'open' }, messages: [], unread: 2 })
    renderWidget()
    expect(await screen.findByTestId('live-unread')).toHaveTextContent('2')
    expect(getMessages).toHaveBeenCalledWith(9, expect.objectContaining({ token: 'tok', seen: false }))
    expect(screen.getByRole('button', { name: /2 new replies from our team/ })).toBeInTheDocument()
  })

  it('sends the conversation and shows the reply; refreshes the cart when the bot added items', async () => {
    vi.mocked(getChatConfig).mockResolvedValue({ enabled: true })
    vi.mocked(sendChat).mockResolvedValue({ reply: 'Added [Yoga Mat 6mm](/products/27) to your cart.', cart_updated: true })
    const { refreshCart } = renderWidget({ user: { username: 'rupa' } })
    fireEvent.click(screen.getByRole('button', { name: 'Open shopping assistant' }))
    expect(await screen.findByText(/Hi rupa!/)).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'add a yoga mat' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }))
    expect(await screen.findByRole('link', { name: 'Yoga Mat 6mm' })).toHaveAttribute('href', '/products/27')
    expect(sendChat).toHaveBeenCalledWith([{ role: 'user', content: 'add a yoga mat' }])
    await waitFor(() => expect(refreshCart).toHaveBeenCalled())
    // conversation survives a re-mount in the same tab
    expect(JSON.parse(sessionStorage.getItem('haatbox-chat'))).toHaveLength(2)
  })

  it('suggestion chips send a question', async () => {
    vi.mocked(getChatConfig).mockResolvedValue({ enabled: true })
    vi.mocked(sendChat).mockResolvedValue({ reply: 'Standard delivery is ৳120.', cart_updated: false })
    renderWidget()
    fireEvent.click(screen.getByRole('button', { name: 'Open shopping assistant' }))
    fireEvent.click(await screen.findByRole('button', { name: 'How much is delivery?' }))
    expect(await screen.findByText('Standard delivery is ৳120.')).toBeInTheDocument()
  })

  it('shows an error with retry', async () => {
    vi.mocked(getChatConfig).mockResolvedValue({ enabled: true })
    vi.mocked(sendChat).mockRejectedValueOnce({ response: { status: 502, data: { detail: 'The assistant is unavailable right now.' } } })
    vi.mocked(sendChat).mockResolvedValueOnce({ reply: 'Back again!', cart_updated: false })
    renderWidget()
    fireEvent.click(screen.getByRole('button', { name: 'Open shopping assistant' }))
    fireEvent.change(await screen.findByLabelText('Message'), { target: { value: 'hello' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('unavailable')
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('Back again!')).toBeInTheDocument()
    expect(screen.getAllByTestId('chat-user')).toHaveLength(1) // no duplicate question
  })
})

describe('ChatWidget auto-reply', () => {
  beforeEach(() => {
    sessionStorage.clear()
    localStorage.clear()
    Element.prototype.scrollTo = () => {}
    vi.mocked(getMyConversation).mockReset().mockRejectedValue({ response: { status: 404 } })
  })

  it('without an API key the built-in bot answers (mode "basic")', async () => {
    vi.mocked(getChatConfig).mockResolvedValue({ enabled: true, mode: 'basic' })
    vi.mocked(sendChat).mockResolvedValue({ reply: 'Standard delivery is ৳120.', cart_updated: false, handoff: false, mode: 'basic' })
    renderWidget()
    fireEvent.click(screen.getByRole('button', { name: 'Open shopping assistant' }))
    expect(await screen.findByTestId('chat-subtitle')).toHaveTextContent('Auto-reply')
    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'delivery?' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }))
    expect(await screen.findByText('Standard delivery is ৳120.')).toBeInTheDocument()
  })

  it('live chat: shows "team away" before starting and labels AI auto-replies', async () => {
    vi.mocked(getChatConfig).mockResolvedValue({ enabled: true, mode: 'basic' })
    vi.mocked(startConversation).mockResolvedValue({
      conversation: { id: 5, status: 'open' },
      messages: [
        { id: 1, sender: 'customer', text: 'hi', created_at: '2026-11-22T10:00:00Z' },
        { id: 2, sender: 'system', text: 'Our team is offline…', created_at: '2026-11-22T10:00:00Z' },
        { id: 3, sender: 'assistant', is_auto_reply: true, sender_label: 'AI assistant (auto-reply)', text: 'Hello! 👋', created_at: '2026-11-22T10:00:00Z' },
      ],
      token: 't', team_online: false, auto_reply: true,
    })
    vi.mocked(getMessages).mockResolvedValue({ conversation: { id: 5, status: 'open' }, messages: [], unread: 0, team_online: false, auto_reply: true })
    renderWidget()
    fireEvent.click(screen.getByRole('button', { name: 'Open shopping assistant' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Talk to a person' }))
    expect(await screen.findByTestId('live-presence')).toHaveTextContent('AI assistant will answer straight away')
    fireEvent.change(screen.getByLabelText('Message to our team'), { target: { value: 'hi' } })
    fireEvent.click(screen.getByRole('button', { name: 'Start chat' }))
    expect(await screen.findByText('Hello! 👋')).toBeInTheDocument()
    expect(screen.getByText('✦ AI assistant · auto-reply')).toBeInTheDocument()
  })
})
