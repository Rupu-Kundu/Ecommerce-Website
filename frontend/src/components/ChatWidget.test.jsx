import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthContext } from '../context/authContext'
import { CartContext } from '../context/cartContext'
import { getChatConfig, sendChat } from '../services/chatService'
import ChatMessageText from './ChatMessageText'
import ChatWidget from './ChatWidget'

vi.mock('../services/chatService', () => ({ getChatConfig: vi.fn(), sendChat: vi.fn() }))

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
    vi.mocked(getChatConfig).mockReset()
    vi.mocked(sendChat).mockReset()
    Element.prototype.scrollTo = () => {}
  })

  it('shows an offline notice when the assistant is not configured', async () => {
    vi.mocked(getChatConfig).mockResolvedValue({ enabled: false })
    renderWidget()
    fireEvent.click(screen.getByRole('button', { name: 'Open shopping assistant' }))
    expect(await screen.findByTestId('chat-offline')).toHaveTextContent('offline')
    expect(screen.getByLabelText('Message')).toBeDisabled()
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
