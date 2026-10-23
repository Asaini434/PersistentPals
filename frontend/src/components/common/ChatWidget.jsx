import { useEffect, useRef, useState } from 'react';
import { Bot, LoaderCircle, MessageCircle, RotateCcw, Send, X } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { chatService } from '../../services/chatService';

const initialMessage = (role) => ({
  id: 'welcome',
  sender: 'Assistant',
  content:
    role === 'admin'
      ? 'Ask me about a provider, their specialty, or assigned patient count.'
      : 'Ask me about one of your assigned patients, their recent notes, or app engagement.',
});

export default function ChatWidget() {
  const { user, isAuthenticated } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState('');
  const endOfMessagesRef = useRef(null);

  useEffect(() => {
    if (!isOpen || !isAuthenticated) return undefined;

    let active = true;
    setIsLoading(true);
    setError('');
    chatService
      .getMessages()
      .then((history) => {
        if (active) setMessages(history.length ? history : [initialMessage(user?.role)]);
      })
      .catch((loadError) => {
        if (active) {
          setMessages([initialMessage(user?.role)]);
          setError(loadError.message || 'Unable to load chat history.');
        }
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [isOpen, isAuthenticated, user?.role]);

  useEffect(() => {
    endOfMessagesRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, isSending, isOpen]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    const message = draft.trim();
    if (!message || isSending) return;

    setDraft('');
    setError('');
    setIsSending(true);
    setMessages((current) => [
      ...current,
      { id: `pending-${Date.now()}`, sender: 'User', content: message },
    ]);

    try {
      const response = await chatService.sendMessage(message);
      setMessages((current) => [
        ...current.filter((item) => !String(item.id).startsWith('pending-')),
        response.user_message,
        response.assistant_message,
      ]);
    } catch (sendError) {
      setError(sendError.message || 'Unable to send your message.');
    } finally {
      setIsSending(false);
    }
  };

  const handleClear = async () => {
    setError('');
    try {
      await chatService.clearMessages();
      setMessages([initialMessage(user?.role)]);
    } catch (clearError) {
      setError(clearError.message || 'Unable to clear chat history.');
    }
  };

  if (!isAuthenticated) return null;

  return (
    <div className="chat-widget">
      {isOpen && (
        <section className="chat-panel" aria-label="ReflectX assistant">
          <header className="chat-panel-header">
            <span className="chat-avatar" aria-hidden="true"><Bot size={18} /></span>
            <div className="chat-heading">
              <strong>ReflectX assistant</strong>
              <span>{user?.role === 'admin' ? 'Provider support' : 'Patient support'}</span>
            </div>
            <div className="chat-header-actions">
              <button type="button" className="chat-icon-button" onClick={handleClear} aria-label="Clear conversation" title="Clear conversation" disabled={isSending || isLoading}>
                <RotateCcw size={16} />
              </button>
              <button type="button" className="chat-icon-button" onClick={() => setIsOpen(false)} aria-label="Close chat" title="Close chat">
                <X size={18} />
              </button>
            </div>
          </header>

          <div className="chat-message-list" aria-live="polite" aria-busy={isLoading || isSending}>
            {messages.map((message) => (
              <article key={message.id} className={`chat-message ${message.sender === 'User' ? 'chat-message-user' : 'chat-message-assistant'}`}>
                {message.sender !== 'User' && <span className="chat-message-mark" aria-hidden="true"><Bot size={14} /></span>}
                <p>{message.content}</p>
              </article>
            ))}
            {(isLoading || isSending) && (
              <div className="chat-typing" role="status">
                <LoaderCircle size={15} className="chat-spinner" />
                <span>{isLoading ? 'Loading conversation' : 'Checking records'}</span>
              </div>
            )}
            <div ref={endOfMessagesRef} />
          </div>

          {error && <p className="chat-error" role="alert">{error}</p>}

          <form className="chat-composer" onSubmit={handleSubmit}>
            <label className="sr-only" htmlFor="chat-message-input">Ask the assistant</label>
            <textarea
              id="chat-message-input"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  event.currentTarget.form?.requestSubmit();
                }
              }}
              placeholder={user?.role === 'admin' ? 'Ask about a provider...' : 'Ask about an assigned patient...'}
              maxLength={2000}
              rows={1}
              disabled={isSending}
            />
            <button type="submit" aria-label="Send message" title="Send message" disabled={!draft.trim() || isSending}>
              <Send size={17} />
            </button>
          </form>
          <p className="chat-disclaimer">Record summaries only. Confirm details in the patient or provider record.</p>
        </section>
      )}

      <button
        type="button"
        className={`chat-launcher ${isOpen ? 'chat-launcher-open' : ''}`}
        onClick={() => setIsOpen((open) => !open)}
        aria-label={isOpen ? 'Close assistant' : 'Open assistant'}
        aria-expanded={isOpen}
        title={isOpen ? 'Close assistant' : 'Open assistant'}
      >
        {isOpen ? <X size={22} /> : <MessageCircle size={23} />}
      </button>
    </div>
  );
}
