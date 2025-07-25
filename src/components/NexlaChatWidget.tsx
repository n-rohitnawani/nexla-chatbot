import { useState, useRef, useEffect } from 'react';
import { X, Send, Sparkles, Search, Mic, MessageCircle, History, Plus } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

const NEXLA_PURPLE = '#6154FF';
const NEXLA_BG = '#F2F1FF';
const BUTTON_BG = '#E7E5F7';
const BORDER_RADIUS = 20;

// Types for results
 type ChatMessage = {
   question: string;
   answer: string;
 };

 type ChatSession = {
   id: string;
   created: number;
   messages: ChatMessage[];
 };

export default function NexlaChatWidget() {
  const [input, setInput] = useState('');
  const [showResult, setShowResult] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Track if localStorage is available
  const [storageAvailable, setStorageAvailable] = useState(true);

  // Track the current fetch controller for cancellation
  const fetchControllerRef = useRef<AbortController | null>(null);

  // Chat sessions state with robust fallback
  const [chatSessions, setChatSessions] = useState<ChatSession[]>(() => {
    try {
      const stored = localStorage.getItem('nexla_chat_sessions');
      if (stored) {
        return JSON.parse(stored);
      }
    } catch {
      // localStorage not available, fallback to in-memory
      setStorageAvailable(false);
    }
    return [{
      id: String(Date.now()),
      created: Date.now(),
      messages: [],
    }];
  });
  // Persist currentSessionIdx in localStorage
  const [currentSessionIdx, setCurrentSessionIdx] = useState(() => {
    try {
      const storedIdx = localStorage.getItem('nexla_current_session_idx');
      if (storedIdx !== null) {
        return parseInt(storedIdx, 10);
      }
    } catch {}
    return 0;
  });
  const [showHistory, setShowHistory] = useState(false);

  // Save chatSessions to localStorage whenever it changes, if available
  useEffect(() => {
    if (!storageAvailable) return;
    try {
      localStorage.setItem('nexla_chat_sessions', JSON.stringify(chatSessions));
    } catch {
      setStorageAvailable(false);
    }
  }, [chatSessions, storageAvailable]);

  // Save currentSessionIdx to localStorage whenever it changes
  useEffect(() => {
    if (!storageAvailable) return;
    try {
      localStorage.setItem('nexla_current_session_idx', String(currentSessionIdx));
    } catch {}
  }, [currentSessionIdx, storageAvailable]);

  // Mock search function (now acts as chat send)
  const performSearch = async (query: string) => {
    setIsSearching(true);
    setShowResult(true);

    // Add page context to the user query
    const pageUrl = window.location.href;
    const userQueryWithContext = `${query}. CONTEXT: User is on this page, use this as a context: ${pageUrl}`;

    // Add a new message with empty answer to start streaming
    setChatSessions((prev) => {
      const updated = [...prev];
      updated[currentSessionIdx] = {
        ...updated[currentSessionIdx],
        messages: [
          ...updated[currentSessionIdx].messages,
          { question: query, answer: '' },
        ],
      };
      return updated;
    });

    // Abort any previous fetch
    if (fetchControllerRef.current) {
      fetchControllerRef.current.abort();
    }
    const controller = new AbortController();
    fetchControllerRef.current = controller;

    try {
      const response = await fetch('https://api-genai.nexla.io/query', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer 6cc2968ce32940f5824d05b551c820ee',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          user_query: userQueryWithContext,
          datasets: [{ id: '341463' }],
          ai_model: 'gpt-4o',
          llm_provider: 'openai',
          streaming: true
        }),
        signal: controller.signal,
      });

      if (!response.body) throw new Error('No response body for streaming');
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let done = false;
      let answer = '';

      while (!done) {
        const { value, done: doneReading } = await reader.read();
        done = doneReading;
        if (value) {
          answer += decoder.decode(value, { stream: !done });
          // Update the last message's answer as we stream
          setChatSessions((prev) => {
            const updated = [...prev];
            const msgs = updated[currentSessionIdx].messages;
            updated[currentSessionIdx] = {
              ...updated[currentSessionIdx],
              messages: [
                ...msgs.slice(0, msgs.length - 1),
                { ...msgs[msgs.length - 1], answer },
              ],
            };
            return updated;
          });
        }
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        // Fetch was aborted, do not update chat
      } else {
        setChatSessions((prev) => {
          const updated = [...prev];
          const msgs = updated[currentSessionIdx].messages;
          updated[currentSessionIdx] = {
            ...updated[currentSessionIdx],
            messages: [
              ...msgs.slice(0, msgs.length - 1),
              { ...msgs[msgs.length - 1], answer: 'Error: ' + (error instanceof Error ? error.message : String(error)) },
            ],
          };
          return updated;
        });
      }
    }

    setIsSearching(false);
    setInput('');
    fetchControllerRef.current = null;
  };

  // Abort fetch if component unmounts (e.g., page navigation)
  useEffect(() => {
    return () => {
      if (fetchControllerRef.current) {
        fetchControllerRef.current.abort();
      }
    };
  }, []);

  // Focus input on mount
  useEffect(() => {
    if (inputRef.current) inputRef.current.focus();
  }, []);

  // --- UI ---
  return (
    <>
      {/* History Popover */}
      {showHistory && (
        <div
          style={{
            position: 'fixed',
            right: 24,
            bottom: 80,
            zIndex: 100,
            background: '#fff',
            border: `2px solid ${NEXLA_PURPLE}`,
            borderRadius: 16,
            boxShadow: '0 4px 24px rgba(97,84,255,0.13)',
            minWidth: 260,
            maxWidth: 340,
            maxHeight: 340,
            overflowY: 'auto',
            padding: 0,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 18px', borderBottom: `1.5px solid ${NEXLA_BG}` }}>
            <span style={{ fontWeight: 700, color: NEXLA_PURPLE, fontSize: 18 }}>Chat History</span>
            <button
              onClick={() => setShowHistory(false)}
              style={{ background: BUTTON_BG, border: 'none', borderRadius: '50%', width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', padding: 0 }}
              aria-label="Close history"
            >
              <X size={18} color={NEXLA_PURPLE} />
            </button>
          </div>
          <div>
            {chatSessions.length === 0 ? (
              <div style={{ padding: 18, color: '#888', textAlign: 'center' }}>No chats yet</div>
            ) : (
              chatSessions.map((session, idx) => (
                <div
                  key={session.id}
                  style={{
                    padding: '14px 18px',
                    borderBottom: idx !== chatSessions.length - 1 ? `1px solid ${NEXLA_BG}` : 'none',
                    background: idx === currentSessionIdx ? NEXLA_BG : '#fff',
                    cursor: 'pointer',
                    fontWeight: idx === currentSessionIdx ? 700 : 500,
                    color: idx === currentSessionIdx ? NEXLA_PURPLE : '#232336',
                    fontSize: 15,
                    transition: 'background 0.15s',
                  }}
                  onClick={() => {
                    setCurrentSessionIdx(idx);
                    setShowHistory(false);
                    setShowResult(true);
                    setOpen(true);
                  }}
                >
                  {session.messages[0]?.question
                    ? session.messages[0].question.slice(0, 32) + (session.messages[0].question.length > 32 ? '...' : '')
                    : 'New Chat'}
                  <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>{new Date(session.created).toLocaleString()}</div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
      {/* Backdrop when result is open */}
      {showResult && !storageAvailable && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100vw',
          zIndex: 200,
          background: 'rgba(255,255,0,0.95)',
          color: '#232336',
          fontWeight: 700,
          fontSize: 16,
          padding: '12px 0',
          textAlign: 'center',
        }}>
          Chat history will not persist after reload (localStorage unavailable)
        </div>
      )}
      {/* Answer/Result Panel (now shows chat history) */}
      {open && showResult && (
        <div
          style={{
            position: 'fixed',
            left: '50%',
            transform: 'translateX(-50%)',
            bottom: 100, // Reduced space between result panel and search bar
            zIndex: 50,
            width: '60vw',
            maxWidth: 900,
            background: '#F9F9FF',
            border: `2.5px solid ${NEXLA_PURPLE}`,
            borderRadius: 24,
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '0 8px 32px rgba(97,84,255,0.13)',
            maxHeight: '60vh',
          }}
        >
          {/* New Header */}
          <div style={{ background: NEXLA_PURPLE, color: '#fff', padding: '14px 20px 10px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ background: '#fff', borderRadius: 12, width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', marginRight: 6 }}>
                <Sparkles size={20} color={NEXLA_PURPLE} />
              </div>
              <span style={{ fontWeight: 800, fontSize: 22, letterSpacing: '-1px' }}>Hey Nexla!</span>
            </div>
            <button
              onClick={() => { 
                setShowResult(false); 
                setOpen(false); 
                setShowHistory(false);
                // Reset search state and abort any ongoing fetch
                setIsSearching(false);
                if (fetchControllerRef.current) {
                  fetchControllerRef.current.abort();
                  fetchControllerRef.current = null;
                }
              }}
              style={{ background: 'rgba(255,255,255,0.12)', border: 'none', borderRadius: '50%', width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'background 0.15s', marginLeft: 8, padding: 0 }}
              aria-label="Close results"
            >
              <X size={20} color="#fff" />
            </button>
          </div>
          {/* Main Content */}
          <div style={{ flex: 1, overflowY: 'auto', background: '#F9F9FF', padding: '38px 48px 32px 48px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            {/* Show all Q&A pairs in the current session */}
            {chatSessions[currentSessionIdx]?.messages.map((msg, idx) => {
              let answerText = msg.answer;
              let relatedQuestions: string[] = [];
              let citations: string[] = [];
              // Extract and remove 'Source Citation:' block (plain text, not markdown links)
              const citationBlockMatch = answerText.match(/Source Citation:\s*([\s\S]*?)(\n\n|$)/i);
              if (citationBlockMatch) {
                answerText = answerText.replace(citationBlockMatch[0], '').trim();
                citations = citationBlockMatch[1]
                  .split('\n')
                  .map(line => line.trim())
                  .filter(line => line.length > 0);
              }
              // Extract all markdown links from the answer (not just from 'Source')
              const allLinks: { label: string; url: string }[] = [];
              answerText = answerText.replace(/\[([^\]]+)\]\(([^\)]+)\)/g, (_, label, url) => {
                allLinks.push({ label, url });
                return '';
              });
              // Extract markdown links from each citation line, ignore trailing text
              citations.forEach(line => {
                const match = line.match(/\[([^\]]+)\]\(([^\)]+)\)/);
                if (match) {
                  allLinks.push({ label: match[1], url: match[2] });
                }
              });
              // Remove markdown links from citation lines so they don't show as text
              citations = citations.map(line => line.replace(/\[([^\]]+)\]\(([^\)]+)\)/, '').trim()).filter(line => line.length > 0);
              // Remove legacy 'Source:' section if present
              const sourceMatch = answerText.match(/Source:\s*((\[[^\]]+\]\([^\)]+\),?\s*)+)/i);
              if (sourceMatch) {
                answerText = answerText.replace(sourceMatch[0], '').trim();
              }
              const relatedMatch = answerText.match(/Related Questions:\s*((?:- .+\n?)+)/i);
              if (relatedMatch) {
                answerText = answerText.replace(relatedMatch[0], '').trim();
                relatedQuestions = relatedMatch[1]
                  .split('\n')
                  .map(q => q.replace(/^\-\s*/, '').trim())
                  .filter(q => q.length > 0);
              }
              return (
                <div key={idx} style={{ width: '100%', marginBottom: 32 }}>
                  {/* Main Question */}
                  <div style={{ fontWeight: 800, fontSize: 32, color: '#232336', marginBottom: 18, width: '100%', textAlign: 'left', lineHeight: 1.2 }}>
                    <span style={{ background: '#E7E5F7', borderRadius: 8, padding: '0 8px' }}> {msg.question} </span>
                  </div>
                  {/* Main Answer */}
                  <div style={{ fontSize: 18, color: '#232336', marginBottom: 24, width: '100%', textAlign: 'left', lineHeight: 1.6 }}>
                    <ReactMarkdown>{answerText}</ReactMarkdown>
                  </div>
                  {/* Action Buttons (above sources) */}
                  <div style={{ display: 'flex', gap: 14, marginBottom: 24 }}>
                    <button style={{ background: 'linear-gradient(90deg, #6154FF 0%, #A084FF 100%)', color: '#fff', borderRadius: 10, border: 'none', padding: '10px 22px', fontWeight: 700, fontSize: 16, boxShadow: '0 2px 8px rgba(97,84,255,0.10)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}>
                      Schedule a Demo <span style={{ fontSize: 18, marginLeft: 4 }}>→</span>
                    </button>
                    <button style={{ background: '#fff', color: NEXLA_PURPLE, borderRadius: 10, border: `2px solid ${NEXLA_PURPLE}`, padding: '10px 22px', fontWeight: 700, fontSize: 16, boxShadow: '0 2px 8px rgba(97,84,255,0.10)', cursor: 'pointer' }}>Let's Talk Now</button>
                  </div>
                  {/* You May Be Interested In section (all links as buttons) */}
                  {allLinks.length > 0 && (
                    <div style={{ width: '100%', marginBottom: 24, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                      <div style={{ fontWeight: 700, fontSize: 24, color: '#232336', marginBottom: 18, textAlign: 'center', width: '100%' }}>You May Be Interested In</div>
                      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'flex-start', width: '100%' }}>
                        {allLinks.map((src, i) => (
                          <a key={src.label + i} href={src.url} target="_blank" rel="noopener noreferrer" style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 7,
                            background: 'linear-gradient(90deg, #B388FF 0%, #F2A1FF 100%)',
                            color: '#fff',
                            borderRadius: 8,
                            padding: '7px 16px',
                            fontWeight: 700,
                            fontSize: 15,
                            cursor: 'pointer',
                            textDecoration: 'none',
                            border: 'none',
                            transition: 'background 0.15s',
                          }}>
                            <span style={{ fontSize: 17 }}>🔗</span> {src.label}
                          </a>
                        ))}
                      </div>
                    </div>
                  )}
                  {/* Related Questions (dynamic) */}
                  {relatedQuestions.length > 0 && (
                    <div style={{ width: '100%', background: '#F2F1FF', border: `1.5px dashed ${NEXLA_PURPLE}`, borderRadius: 18, padding: '24px 24px 12px 24px', marginBottom: 8 }}>
                      <div style={{ fontWeight: 700, fontSize: 20, color: '#232336', marginBottom: 18, textAlign: 'left' }}>Related Questions</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {relatedQuestions.map((q, i) => (
                          <div
                            key={q}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              fontSize: 16,
                              color: '#232336',
                              cursor: 'pointer',
                              padding: '8px 0',
                              borderBottom: i !== relatedQuestions.length - 1 ? '1px solid #E7E5F7' : 'none',
                            }}
                            onClick={() => performSearch(q)}
                          >
                            <span>{q}</span>
                            <span style={{ color: NEXLA_PURPLE, fontSize: 18, marginLeft: 8 }}>↗</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
            {/* If searching, show loading at the end */}
            {isSearching && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 40, width: '100%' }}>
                <Sparkles size={28} color={NEXLA_PURPLE} />
                <span style={{ marginLeft: 16, color: NEXLA_PURPLE, fontWeight: 600, fontSize: 18 }}>AI is searching Nexla knowledge base...</span>
              </div>
            )}
          </div>
        </div>
      )}
      {/* Sticky Search Bar (slide up) */}
      <div
        style={{
          position: 'fixed',
          left: '50%',
          transform: 'translateX(-50%)',
          bottom: open ? 24 : -80,
          zIndex: 60,
          maxWidth: 900,
          width: '60vw',
          borderRadius: BORDER_RADIUS,
          border: `3px solid ${NEXLA_PURPLE}`,
          background: NEXLA_BG,
          display: open ? 'flex' : 'none',
          alignItems: 'center',
          padding: '0',
          minHeight: 54,
          boxShadow: open ? '0 4px 24px rgba(97,84,255,0.13), 0 1.5px 8px rgba(97,84,255,0.10)' : 'none',
          transition: 'bottom 0.35s cubic-bezier(.4,2,.6,1), box-shadow 0.2s',
        }}
      >
        {/* Search Icon */}
        <span style={{ marginLeft: 14, marginRight: 8, display: 'flex', alignItems: 'center', color: NEXLA_PURPLE, fontSize: 22 }}>
          <Search size={22} color={NEXLA_PURPLE} />
        </span>
        {/* Input */}
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="Ask any question about Nexla"
          style={{
            flex: 1,
            background: 'transparent',
            border: 'none',
            fontSize: 16,
            fontWeight: 600,
            color: '#232336',
            padding: '0 8px',
            outline: 'none',
            boxShadow: 'none',
            letterSpacing: '0.01em',
            minHeight: 54,
          }}
          autoFocus
          onKeyDown={e => {
            if (e.key === 'Enter') {
              e.preventDefault();
              if (input.trim()) {
                setInput(''); // Clear input immediately
                performSearch(input.trim());
              }
            }
          }}
        />
        {/* Mic Button */}
        <button
          type="button"
          aria-label="Voice input"
          style={{
            background: BUTTON_BG,
            border: 'none',
            borderRadius: '50%',
            width: 36,
            height: 36,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginRight: 6,
            marginLeft: 2,
            cursor: isSearching ? 'not-allowed' : 'pointer',
            transition: 'background 0.18s',
            outline: 'none',
            padding: 0,
            opacity: isSearching ? 0.5 : 1,
          }}
          disabled={isSearching}
        >
          <Mic size={22} color={NEXLA_PURPLE} />
        </button>
        {/* Send Button */}
        <button
          type="button"
          aria-label="Send"
          onClick={e => {
            e.preventDefault();
            if (input.trim()) {
              setInput(''); // Clear input immediately
              performSearch(input.trim());
            }
          }}
          style={{
            background: input.trim() ? NEXLA_PURPLE : BUTTON_BG,
            color: input.trim() ? '#fff' : NEXLA_PURPLE,
            border: 'none',
            borderRadius: '50%',
            width: 36,
            height: 36,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 22,
            fontWeight: 900,
            cursor: input.trim() && !isSearching ? 'pointer' : 'not-allowed',
            marginRight: 4,
            marginLeft: 2,
            boxShadow: 'none',
            transition: 'background 0.18s, color 0.18s',
            outline: 'none',
            padding: 0,
            opacity: input.trim() && !isSearching ? 1 : 0.6,
          }}
          disabled={!input.trim() || isSearching}
        >
          <Send size={22} color={input.trim() ? '#fff' : NEXLA_PURPLE} />
        </button>
        {/* History Button */}
        <button
          type="button"
          aria-label="Chat history"
          onClick={() => setShowHistory((v) => !v)}
          style={{
            background: BUTTON_BG,
            border: 'none',
            borderRadius: '50%',
            width: 36,
            height: 36,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginRight: 4,
            marginLeft: 2,
            cursor: isSearching ? 'not-allowed' : 'pointer',
            transition: 'background 0.18s',
            outline: 'none',
            padding: 0,
            opacity: isSearching ? 0.5 : 1,
          }}
          disabled={isSearching}
        >
          <History size={20} color={NEXLA_PURPLE} />
        </button>
        {/* New Chat Button */}
        <button
          type="button"
          aria-label="New chat"
          onClick={() => {
            setChatSessions((prev) => [
              ...prev,
              { id: String(Date.now()), created: Date.now(), messages: [] },
            ]);
            setCurrentSessionIdx(chatSessions.length);
            setShowResult(true);
            setInput('');
          }}
          style={{
            background: BUTTON_BG,
            border: 'none',
            borderRadius: '50%',
            width: 36,
            height: 36,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginRight: 4,
            marginLeft: 2,
            cursor: isSearching ? 'not-allowed' : 'pointer',
            transition: 'background 0.18s',
            outline: 'none',
            padding: 0,
            opacity: isSearching ? 0.5 : 1,
          }}
          disabled={isSearching}
        >
          <Plus size={20} color={NEXLA_PURPLE} />
        </button>
        {/* Close Button (now inside search bar, next to new chat) */}
        {showResult && (
          <button
            aria-label="Close answer"
            onClick={() => { 
              setShowResult(false); 
              setOpen(false); 
              setShowHistory(false);
              // Reset search state and abort any ongoing fetch
              setIsSearching(false);
              if (fetchControllerRef.current) {
                fetchControllerRef.current.abort();
                fetchControllerRef.current = null;
              }
            }}
            style={{
              background: BUTTON_BG,
              border: 'none',
              color: NEXLA_PURPLE,
              fontSize: 22,
              cursor: 'pointer',
              borderRadius: '50%',
              width: 36,
              height: 36,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: 'none',
              transition: 'background 0.15s',
              marginRight: 10,
              marginLeft: 2,
              outline: 'none',
              padding: 0,
            }}
            onMouseOver={e => (e.currentTarget.style.background = NEXLA_BG)}
            onMouseOut={e => (e.currentTarget.style.background = BUTTON_BG)}
          >
            <X size={22} color={NEXLA_PURPLE} />
          </button>
        )}
      </div>
      {/* Floating Button to open chat */}
      {!open && (
        <button
          style={{
            position: 'fixed',
            bottom: 24,
            right: 24,
            background: NEXLA_PURPLE,
            color: '#fff',
            borderRadius: 9999,
            border: 'none',
            minWidth: 120,
            minHeight: 48,
            fontWeight: 700,
            fontSize: 18,
            boxShadow: '0 4px 16px rgba(97,84,255,0.18)',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            zIndex: 70,
            cursor: 'pointer',
            padding: '0 18px',
            transition: 'background 0.18s',
          }}
          onClick={() => setOpen(true)}
        >
          <MessageCircle size={22} color="#fff" />
          Hey Nexla!
        </button>
      )}
    </>
  );
} 
