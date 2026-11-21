import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getAdminMessages, listConversations, replyToConversation, setConversationAutoReply, setConversationStatus } from '../../services/supportService'
import AdminSupportPage from './AdminSupportPage'

vi.mock('../../services/supportService', () => ({
  listConversations: vi.fn(),
  getAdminMessages: vi.fn(),
  replyToConversation: vi.fn(),
  setConversationStatus: vi.fn(),
  setConversationAutoReply: vi.fn(),
}))

const now = new Date().toISOString()
const conversation = {
  id: 4, status: 'open', from_assistant: true, ai_auto_reply: true, unread: 2,
  customer: { label: 'Mina', email: null, guest: true },
  last_message: { sender: 'customer', text: 'Order is late' },
  created_at: now, last_message_at: now,
}

describe('AdminSupportPage', () => {
  beforeEach(() => {
    Element.prototype.scrollTo = () => {}
    vi.mocked(listConversations).mockReset().mockResolvedValue([conversation])
    vi.mocked(getAdminMessages).mockReset().mockResolvedValue({
      conversation: { ...conversation, unread: 0 },
      messages: [
        { id: 1, sender: 'assistant', text: 'Sorry about that!', created_at: now },
        { id: 2, sender: 'customer', text: 'Order is late', created_at: now },
        { id: 3, sender: 'assistant', is_auto_reply: true, text: 'A person will follow up.', created_at: now },
      ],
    })
    vi.mocked(replyToConversation).mockReset().mockResolvedValue({ id: 3 })
    vi.mocked(setConversationStatus).mockReset().mockResolvedValue({})
    vi.mocked(setConversationAutoReply).mockReset().mockResolvedValue({})
  })

  it('lists chats with unread counts, opens one and replies', async () => {
    render(<MemoryRouter initialEntries={['/admin-dashboard/chat']}><AdminSupportPage /></MemoryRouter>)
    expect(await screen.findByTestId('admin-chat-unread')).toHaveTextContent('2')
    expect(screen.getByText('from AI')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('admin-chat-row'))
    expect(await screen.findByText('Sorry about that!')).toBeInTheDocument()
    expect(screen.getByText(/handed over by AI/)).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Reply'), { target: { value: 'Hi Mina, checking now' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    await waitFor(() => expect(replyToConversation).toHaveBeenCalledWith(4, 'Hi Mina, checking now'))
    expect(screen.getByText(/AI auto-reply ·/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'AI auto-reply: On' }))
    await waitFor(() => expect(setConversationAutoReply).toHaveBeenCalledWith(4, false))
    fireEvent.click(screen.getByRole('button', { name: 'Close chat' }))
    await waitFor(() => expect(setConversationStatus).toHaveBeenCalledWith(4, 'closed'))
  })
})
