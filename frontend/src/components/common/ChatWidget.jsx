import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { 
  Bot, 
  LoaderCircle, 
  MessageCircle, 
  RotateCcw, 
  Send, 
  Sparkles, 
  X,
  Activity,
  Headphones,
  Smartphone,
  TrendingUp,
  Clock
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { chatService } from '../../services/chatService';

const PROVIDER_PROMPTS = [
  { label: '🎨 VR vs Mobile Use', prompt: 'Summarize VR vs Mobile engagement for my assigned patients' },
  { label: '📈 Therapeutic Mood', prompt: 'What are the recent therapeutic mood scores and response trends?' },
  { label: '⏱️ RTM 20-Min Target', prompt: 'Check RTM review minutes logged toward the CPT 98980 threshold' },
  { label: '👥 Patient Snapshot', prompt: 'Give me an overview of my assigned patients' },
];

const ADMIN_PROMPTS = [
  { label: '👨‍⚕️ Provider Workloads', prompt: 'List all providers and their active patient counts' },
  { label: '📊 Panel Engagement', prompt: 'Show total Reflect XR and Mobile usage across providers' },
  { label: '⏱️ RTM Review Minutes', prompt: 'Which providers have logged RTM review time this month?' },
];

const initialMessage = (role) => ({
  id: 'welcome',
  sender: 'Assistant',
  content:
    role === 'admin'
      ? '**ReflectX Clinical Intelligence**  \nAsk me about provider workloads, panel-wide Reflect XR & Mobile usage, or RTM monitoring hours.'
      : '**ReflectX Clinical Intelligence (PTI)**  \nWelcome! I can provide clinical insights into your patients\' **Reflect XR** (VR artmaking) & **Reflect Mobile** engagement, therapeutic mood responses, and **Remote Therapeutic Monitoring (RTM)** reimbursement tracking.  \n\n*Choose a suggested prompt below or ask about any patient!*',
});

function renderInline(text) {
  if (!text) return null;
  const parts = [];
  const regex = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.substring(lastIndex, match.index));
    }
    const token = match[0];
    if (token.startsWith('**') && token.endsWith('**')) {
      parts.push(<strong key={match.index}>{token.slice(2, -2)}</strong>);
    } else if (token.startsWith('`') && token.endsWith('`')) {
      parts.push(<code key={match.index} className="chat-inline-badge">{token.slice(1, -1)}</code>);
    }
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) {
    parts.push(text.substring(lastIndex));
  }

  return parts;
}

function FormattedContent({ text }) {
  if (!text) return null;

  const blocks = text.split(/\n\n+/);

  return (
    <div className="chat-content-formatted">
      {blocks.map((block, bIdx) => {
        const trimmed = block.trim();
        if (trimmed.startsWith('>')) {
          const quoteText = trimmed.replace(/^>\s*/gm, '');
          return (
            <blockquote key={bIdx} className="chat-callout">
              {renderInline(quoteText)}
            </blockquote>
          );
        }

        const lines = trimmed.split('\n');
        const isList = lines.every((line) => line.trim().startsWith('- ') || line.trim().startsWith('* ') || line.trim() === '');
        if (isList && lines.length > 0) {
          return (
            <ul key={bIdx} className="chat-bullet-list">
              {lines
                .filter((l) => l.trim().length > 0)
                .map((line, lIdx) => {
                  const cleaned = line.trim().replace(/^[-*]\s*/, '');
                  return <li key={lIdx}>{renderInline(cleaned)}</li>;
                })}
            </ul>
          );
        }

        return (
          <p key={bIdx} className="chat-paragraph">
            {renderInline(trimmed)}
          </p>
        );
      })}
    </div>
  );
}

export default function ChatWidget() {
  const { user, isAuthenticated } = useAuth();
  const location = useLocation();
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState('');
  const endOfMessagesRef = useRef(null);

  // Detect if provider is on a client detail page
  const patientMatch = location.pathname.match(/\/patients\/([^/]+)/);
  const activePatientId = patientMatch ? patientMatch[1] : null;

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

  const sendQuery = async (queryText) => {
    const message = queryText.trim();
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
      setError(sendError.message || 'Unable to connect to assistant.');
    } finally {
      setIsSending(false);
    }
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    sendQuery(draft);
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

  const quickPrompts = user?.role === 'admin' ? ADMIN_PROMPTS : PROVIDER_PROMPTS;

  return (
    <div className="chat-widget">
      {isOpen && (
        <section className="chat-panel" aria-label="ReflectX Clinical Assistant">
          <header className="chat-panel-header">
            <div className="chat-avatar-glow" aria-hidden="true">
              <Sparkles size={17} className="chat-sparkle-icon" />
            </div>
            <div className="chat-heading">
              <div className="chat-title-row">
                <strong>ReflectX Assistant</strong>
                <span className="chat-badge-pti">PTI Health</span>
              </div>
              <span className="chat-subtitle">
                {user?.role === 'admin' 
                  ? 'Administrator & Provider Analytics' 
                  : 'Reflect XR & Mobile Clinical Intelligence'}
              </span>
            </div>
            <div className="chat-header-actions">
              <button 
                type="button" 
                className="chat-icon-button" 
                onClick={handleClear} 
                aria-label="Clear conversation" 
                title="Clear conversation" 
                disabled={isSending || isLoading}
              >
                <RotateCcw size={15} />
              </button>
              <button 
                type="button" 
                className="chat-icon-button" 
                onClick={() => setIsOpen(false)} 
                aria-label="Close chat" 
                title="Close chat"
              >
                <X size={18} />
              </button>
            </div>
          </header>

          {activePatientId && (
            <div className="chat-context-banner">
              <Activity size={13} className="chat-context-icon" />
              <span>Active Client Page Detected</span>
              <button 
                type="button" 
                className="chat-context-btn"
                onClick={() => sendQuery("Analyze this client's Reflect XR and Mobile engagement")}
                disabled={isSending}
              >
                Analyze Client
              </button>
            </div>
          )}

          <div className="chat-message-list" aria-live="polite" aria-busy={isLoading || isSending}>
            {messages.map((message) => (
              <article 
                key={message.id} 
                className={`chat-message ${message.sender === 'User' ? 'chat-message-user' : 'chat-message-assistant'}`}
              >
                {message.sender !== 'User' && (
                  <span className="chat-message-mark" aria-hidden="true">
                    <Bot size={14} />
                  </span>
                )}
                <div className="chat-bubble">
                  <FormattedContent text={message.content} />
                </div>
              </article>
            ))}
            {(isLoading || isSending) && (
              <div className="chat-typing" role="status">
                <LoaderCircle size={15} className="chat-spinner" />
                <span>{isLoading ? 'Loading records...' : 'Analyzing clinical data & metrics...'}</span>
              </div>
            )}
            <div ref={endOfMessagesRef} />
          </div>

          {/* Quick Prompt Chips */}
          <div className="chat-chips-container" aria-label="Suggested questions">
            {quickPrompts.map((item, idx) => (
              <button
                key={idx}
                type="button"
                className="chat-chip"
                onClick={() => sendQuery(item.prompt)}
                disabled={isSending || isLoading}
              >
                {item.label}
              </button>
            ))}
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
              placeholder={
                user?.role === 'admin' 
                  ? 'Ask about provider workloads or panel metrics...' 
                  : 'Ask about Reflect XR use, mood scores, or RTM status...'
              }
              maxLength={2000}
              rows={1}
              disabled={isSending}
            />
            <button 
              type="submit" 
              className="chat-send-btn"
              aria-label="Send message" 
              title="Send message" 
              disabled={!draft.trim() || isSending}
            >
              <Send size={16} />
            </button>
          </form>
          <div className="chat-footer-note">
            <span>Clinical guidance grounded in Reflect XR & Mobile data (PTI)</span>
          </div>
        </section>
      )}

      <button
        type="button"
        className={`chat-launcher ${isOpen ? 'chat-launcher-open' : ''}`}
        onClick={() => setIsOpen((open) => !open)}
        aria-label={isOpen ? 'Close clinical assistant' : 'Open clinical assistant'}
        aria-expanded={isOpen}
        title={isOpen ? 'Close clinical assistant' : 'Open ReflectX clinical assistant'}
      >
        {isOpen ? <X size={24} /> : (
          <div className="chat-launcher-inner">
            <Sparkles size={22} className="chat-launcher-sparkle" />
          </div>
        )}
      </button>
    </div>
  );
}
