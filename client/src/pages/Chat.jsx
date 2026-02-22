import { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  HeartPulse, Send, Trash2, Loader2, ChevronUp, Sparkles,
  Activity, AlertTriangle, Bell, User,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CONVERSATION_STARTERS = [
  'How are my vitals looking today?',
  'What should I eat to manage my blood sugar?',
  'Explain my risk score to me',
  "I'm feeling dizzy and lightheaded",
  'Remind me about my medications',
];

const CONTEXT_ITEMS = [
  { icon: Activity, label: 'Vitals' },
  { icon: AlertTriangle, label: 'Risk Score' },
  { icon: Bell, label: 'Alerts' },
  { icon: User, label: 'Profile' },
];

const MARKDOWN_COMPONENTS = {
  p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
  ul: ({ children }) => <ul className="list-disc pl-5 mb-2 space-y-0.5">{children}</ul>,
  ol: ({ children }) => <ol className="list-decimal pl-5 mb-2 space-y-0.5">{children}</ol>,
  strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
  code: ({ inline, className, children, ...props }) => {
    if (inline) {
      return (
        <code className="bg-gray-100 text-gray-800 rounded px-1 py-0.5 text-xs" {...props}>
          {children}
        </code>
      );
    }
    return (
      <code className="block bg-gray-100 rounded-lg p-3 text-xs overflow-x-auto mb-2" {...props}>
        {children}
      </code>
    );
  },
  a: ({ href, children }) => (
    <a href={href} className="text-blue-600 underline" target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  ),
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseTimestamp(ts) {
  return new Date(ts.replace(' ', 'T'));
}

function parseSSE(text) {
  const events = [];
  const lines = text.split('\n');
  for (const line of lines) {
    if (line.startsWith('data: ')) {
      try {
        events.push(JSON.parse(line.slice(6)));
      } catch {
        // Skip malformed events
      }
    }
  }
  return events;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function MessageBubble({ message, isStreaming }) {
  const isUser = message.role === 'user';
  const timeAgo = message.created_at
    ? formatDistanceToNow(parseTimestamp(message.created_at), { addSuffix: true })
    : null;

  return (
    <div className={`flex gap-3 ${isUser ? 'flex-row-reverse' : ''}`}>
      {/* Avatar */}
      {!isUser && (
        <div className="flex-shrink-0 h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center">
          <HeartPulse className="h-4 w-4 text-blue-600" />
        </div>
      )}

      {/* Bubble */}
      <div className={`max-w-[85%] sm:max-w-[75%] ${isUser ? 'ml-auto' : ''}`}>
        <div
          className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
            isUser
              ? 'bg-blue-600 text-white rounded-br-md whitespace-pre-wrap'
              : 'bg-white border border-gray-200 text-gray-800 rounded-bl-md shadow-sm chat-markdown'
          }`}
        >
          {isUser ? (
            message.content
          ) : (
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={MARKDOWN_COMPONENTS}>
              {message.content}
            </ReactMarkdown>
          )}
          {isStreaming && (
            <span className="inline-block w-1.5 h-4 ml-0.5 bg-blue-500 rounded-sm animate-pulse align-text-bottom" />
          )}
        </div>
        {timeAgo && (
          <p className={`text-[10px] text-gray-400 mt-1 ${isUser ? 'text-right' : ''}`}>
            {timeAgo}
          </p>
        )}
      </div>
    </div>
  );
}

function ContextBanner() {
  return (
    <div className="flex-shrink-0 flex items-center justify-center gap-4 px-4 sm:px-6 py-2 bg-blue-50/70 border-b border-blue-100">
      <span className="text-[11px] font-medium text-blue-600/70 mr-1">AI has access to:</span>
      {CONTEXT_ITEMS.map(({ icon: Icon, label }) => (
        <span key={label} className="inline-flex items-center gap-1 text-[11px] text-blue-600/80">
          <Icon className="h-3 w-3" />
          {label}
        </span>
      ))}
    </div>
  );
}

function StarterPills({ onSelect, patientName }) {
  const greeting = patientName ? `Hi ${patientName}!` : 'Hi there!';

  return (
    <div className="flex flex-col items-center justify-center flex-1 px-4">
      <div className="p-4 rounded-full bg-blue-50 mb-4">
        <Sparkles className="h-10 w-10 text-blue-500" />
      </div>
      <h2 className="text-xl font-semibold text-gray-900 mb-2">
        {greeting} I'm your HealthGuard AI assistant.
      </h2>
      <p className="text-sm text-gray-500 mb-6 text-center max-w-md">
        I have access to your vitals and health profile to give you personalized guidance. What would you like to know?
      </p>
      <div className="flex flex-wrap justify-center gap-2 max-w-lg">
        {CONVERSATION_STARTERS.map((text) => (
          <button
            key={text}
            onClick={() => onSelect(text)}
            className="px-4 py-2 text-sm text-blue-700 bg-blue-50 border border-blue-200 rounded-full hover:bg-blue-100 transition-colors"
          >
            {text}
          </button>
        ))}
      </div>
    </div>
  );
}

function ClearConfirmDialog({ onConfirm, onCancel }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onCancel} />
      {/* Card */}
      <div className="relative bg-white rounded-2xl shadow-xl p-6 mx-4 max-w-sm w-full">
        <div className="flex items-center gap-3 mb-3">
          <div className="p-2 rounded-lg bg-red-50">
            <Trash2 className="h-5 w-5 text-red-500" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900">Clear conversation?</h3>
        </div>
        <p className="text-sm text-gray-500 mb-5">
          This will permanently delete all messages. This action cannot be undone.
        </p>
        <div className="flex gap-3 justify-end">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors"
          >
            Clear
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function Chat() {
  const [patientId, setPatientId] = useState(null);
  const [patientName, setPatientName] = useState('');
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [streaming, setStreaming] = useState('');
  const [hasOlderMessages, setHasOlderMessages] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);
  const abortRef = useRef(null);

  // Fetch patient ID and name
  useEffect(() => {
    async function fetchPatient() {
      try {
        const { data: patients } = await axios.get('/api/patients');
        if (patients.length) {
          setPatientId(patients[0].id);
          setPatientName(patients[0].name);
        }
      } catch {
        // Silent fail
      }
    }
    fetchPatient();
  }, []);

  // Fetch chat history
  const fetchHistory = useCallback(async (page = 1, prepend = false) => {
    if (!patientId) return;
    try {
      if (!prepend) setLoadingHistory(true);
      const { data } = await axios.get(
        `/api/chat/${patientId}/history?page=${page}&limit=50`,
      );
      if (prepend) {
        setMessages((prev) => [...data.messages, ...prev]);
      } else {
        setMessages(data.messages);
      }
      setHasOlderMessages(page < data.pagination.totalPages);
      setCurrentPage(page);
    } catch {
      // Keep existing messages
    } finally {
      setLoadingHistory(false);
    }
  }, [patientId]);

  useEffect(() => {
    if (patientId) fetchHistory(1);
  }, [patientId, fetchHistory]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (!loadingHistory) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, streaming, loadingHistory]);

  // Send message via SSE
  async function handleSend(text) {
    const messageText = (text || input).trim();
    if (!messageText || sending || !patientId) return;

    // Optimistic user message
    const userMsg = {
      id: `temp-${Date.now()}`,
      role: 'user',
      content: messageText,
      created_at: new Date().toISOString().replace('T', ' ').slice(0, 19),
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setSending(true);
    setStreaming('');

    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const response = await fetch(`/api/chat/${patientId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: messageText }),
        signal: controller.signal,
      });

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let fullContent = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Process complete SSE events in the buffer
        const events = parseSSE(buffer);
        // Keep only the incomplete last line in the buffer
        const lastNewline = buffer.lastIndexOf('\n');
        buffer = lastNewline >= 0 ? buffer.slice(lastNewline + 1) : buffer;

        for (const event of events) {
          if (event.type === 'chunk') {
            fullContent += event.content;
            setStreaming(fullContent);
          } else if (event.type === 'done') {
            fullContent = event.content;
          }
        }
      }

      // Add the assistant message
      const assistantMsg = {
        id: `temp-assistant-${Date.now()}`,
        role: 'assistant',
        content: fullContent,
        created_at: new Date().toISOString().replace('T', ' ').slice(0, 19),
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err) {
      if (err.name !== 'AbortError') {
        const errorMsg = {
          id: `temp-error-${Date.now()}`,
          role: 'assistant',
          content: 'I apologize, but I encountered an error. Please try again.',
          created_at: new Date().toISOString().replace('T', ' ').slice(0, 19),
        };
        setMessages((prev) => [...prev, errorMsg]);
      }
    } finally {
      setStreaming('');
      setSending(false);
      abortRef.current = null;
    }
  }

  async function handleClear() {
    if (!patientId) return;
    setShowClearConfirm(false);
    try {
      await axios.delete(`/api/chat/${patientId}/history`);
      setMessages([]);
      setHasOlderMessages(false);
      setCurrentPage(1);
    } catch {
      // Silent fail
    }
  }

  function handleLoadOlder() {
    fetchHistory(currentPage + 1, true);
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  function handleTextareaInput(e) {
    setInput(e.target.value);
    // Auto-resize
    e.target.style.height = 'auto';
    e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
  }

  const isEmpty = messages.length === 0 && !loadingHistory;

  return (
    <div className="flex flex-col h-full -m-6 bg-[#f8fafc]">
      {/* Header */}
      <div className="flex-shrink-0 flex items-center justify-between px-4 sm:px-6 py-4 bg-white border-b border-gray-200">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-blue-50">
            <HeartPulse className="h-5 w-5 text-blue-600" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-gray-900">AI Health Assistant</h1>
            <p className="text-xs text-gray-500">Powered by HealthGuard AI</p>
          </div>
        </div>
        {messages.length > 0 && (
          <button
            onClick={() => setShowClearConfirm(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Clear
          </button>
        )}
      </div>

      {/* Context banner */}
      <ContextBanner />

      {/* Messages area */}
      {loadingHistory ? (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="h-6 w-6 text-gray-400 animate-spin" />
        </div>
      ) : isEmpty ? (
        <StarterPills onSelect={(text) => handleSend(text)} patientName={patientName} />
      ) : (
        <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 space-y-4">
          {/* Load older */}
          {hasOlderMessages && (
            <div className="flex justify-center">
              <button
                onClick={handleLoadOlder}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-500 bg-white border border-gray-200 rounded-full hover:bg-gray-50 transition-colors"
              >
                <ChevronUp className="h-3.5 w-3.5" />
                Load earlier messages
              </button>
            </div>
          )}

          {/* Message list */}
          {messages.map((msg) => (
            <MessageBubble key={msg.id} message={msg} />
          ))}

          {/* Streaming message */}
          {streaming && (
            <MessageBubble
              message={{ role: 'assistant', content: streaming }}
              isStreaming
            />
          )}

          {/* Thinking indicator */}
          {sending && !streaming && (
            <div className="flex gap-3 items-start">
              <div className="flex-shrink-0 h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center">
                <HeartPulse className="h-4 w-4 text-blue-600" />
              </div>
              <div className="px-4 py-3 bg-white border border-gray-200 rounded-2xl rounded-bl-md shadow-sm">
                <div className="flex items-center gap-2">
                  <div className="flex gap-1">
                    <span className="h-2 w-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="h-2 w-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="h-2 w-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                  <span className="text-xs text-gray-400">Thinking...</span>
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      )}

      {/* Input bar */}
      <div className="flex-shrink-0 bg-white border-t border-gray-200 px-4 sm:px-6 py-4">
        <div className="flex items-end gap-3">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={handleTextareaInput}
            onKeyDown={handleKeyDown}
            placeholder="Ask about your health..."
            disabled={sending || !patientId}
            rows={1}
            className="flex-1 resize-none rounded-xl border border-gray-300 px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
          />
          <button
            onClick={() => handleSend()}
            disabled={!input.trim() || sending || !patientId}
            className="flex-shrink-0 p-2.5 rounded-xl bg-blue-600 text-white hover:bg-blue-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {sending ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <Send className="h-5 w-5" />
            )}
          </button>
        </div>
        <p className="text-[10px] text-gray-400 mt-2 text-center">
          HealthGuard AI provides general wellness guidance. Always consult your healthcare provider for medical decisions.
        </p>
      </div>

      {/* Clear confirmation dialog */}
      {showClearConfirm && (
        <ClearConfirmDialog
          onConfirm={handleClear}
          onCancel={() => setShowClearConfirm(false)}
        />
      )}
    </div>
  );
}
