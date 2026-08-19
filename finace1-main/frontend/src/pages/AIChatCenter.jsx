import React, { useState, useEffect, useRef } from 'react';
import { 
  Bot, Send, Sparkles, User, RefreshCw, MessageSquare, Plus,
  Trash2, ChevronLeft, ChevronRight, Clock, ShieldCheck, TrendingUp
} from 'lucide-react';
import axios from 'axios';
import { useCurrency } from '../context/CurrencyContext';

const AIChatCenter = () => {
  const { formatCurrency } = useCurrency();
  const [sessionId, setSessionId] = useState(
    () => `session_${Date.now()}`
  );
  const [sessions, setSessions] = useState([]);
  const [messages, setMessages] = useState([]);
  const [inputMsg, setInputMsg] = useState('');
  const [loading, setLoading] = useState(false);
  const [summaryData, setSummaryData] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const chatEndRef = useRef(null);

  useEffect(() => {
    fetchSessions();
    fetchSummaryData();
    window.addEventListener('finance-data-updated', fetchSummaryData);
    return () => window.removeEventListener('finance-data-updated', fetchSummaryData);
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const fetchSummaryData = async () => {
    try {
      const res = await axios.get('/api/dashboard/widgets');
      setSummaryData(res.data);
    } catch (err) {
      console.error('Failed to load AI summary data:', err);
    }
  };

  const fetchSessions = async () => {
    try {
      const res = await axios.get('/api/ai/sessions');
      setSessions(res.data || []);
    } catch (err) {
      console.error('Failed to load chat sessions:', err);
    }
  };

  const loadSession = async (sid) => {
    setSessionId(sid);
    setLoading(true);
    try {
      const res = await axios.get(`/api/ai/chat/history?session_id=${sid}`);
      if (res.data && res.data.length > 0) {
        setMessages(res.data);
      } else {
        setMessages([]);
      }
    } catch (err) {
      console.error('Failed to load session history:', err);
    } finally {
      setLoading(false);
    }
  };

  const startNewChat = async () => {
    await fetchSessions();
    const newSid = `session_${Date.now()}`;
    setSessionId(newSid);
    setMessages([]);
  };

  const deleteSession = async (e, sid) => {
    e.stopPropagation();
    try {
      await axios.delete(`/api/ai/session/${sid}`);
      setSessions(prev => prev.filter(s => s.session_id !== sid));
      if (sessionId === sid) {
        startNewChat();
      }
    } catch (err) {
      console.error('Failed to delete chat session:', err);
    }
  };

  const clearAllSessions = async () => {
    try {
      await axios.delete('/api/ai/clear-all-sessions');
      setSessions([]);
      startNewChat();
    } catch (err) {
      console.error('Failed to clear all chat sessions:', err);
    }
  };

  const handleSendText = async (textToSend) => {
    const text = textToSend || inputMsg;
    if (!text.trim() || loading) return;

    const currentSid = sessionId;
    const cleanText = text.trim().replace(/\n/g, ' ');
    const title = cleanText.length > 35 ? cleanText.substring(0, 35) + '...' : cleanText;

    setSessions(prev => {
      const exists = prev.some(s => s.session_id === currentSid);
      if (exists) {
        return prev.map(s => s.session_id === currentSid ? { ...s, last_updated: new Date().toISOString(), message_count: (s.message_count || 1) + 1 } : s);
      } else {
        return [{ session_id: currentSid, title: title || 'Financial Command Session', last_updated: new Date().toISOString(), message_count: 1 }, ...prev];
      }
    });

    setInputMsg('');
    setMessages(prev => [...prev, { sender: 'user', message: text }]);
    setLoading(true);

    try {
      const res = await axios.post('/api/ai/chat', { 
        message: text,
        session_id: currentSid 
      });
      setMessages(prev => [...prev, { sender: 'ai', message: res.data.message }]);
      
      // RULE 4 & 5: Dispatch event to trigger frontend refetch across all open pages!
      if (res.data.action_executed) {
        window.dispatchEvent(new CustomEvent('finance-data-updated'));
        fetchSummaryData();
      }
      fetchSessions();
    } catch (err) {
      console.error('AI agent error:', err);
      setMessages(prev => [...prev, { sender: 'ai', message: 'I encountered an issue executing your AI command. Please try again.' }]);
    } finally {
      setLoading(false);
    }
  };

  const handleFormSubmit = (e) => {
    e.preventDefault();
    handleSendText();
  };

  const formatInlineMarkdown = (text) => {
    if (!text) return text;
    const parts = text.split(/(\*\*.*?\*\*|\*.*?\*|`.*?`)/g);
    return parts.map((part, i) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={i} className="font-bold text-slate-100">{part.slice(2, -2)}</strong>;
      }
      if (part.startsWith('*') && part.endsWith('*')) {
        return <em key={i} className="italic text-indigo-300">{part.slice(1, -1)}</em>;
      }
      if (part.startsWith('`') && part.endsWith('`')) {
        return <code key={i} className="px-1.5 py-0.5 rounded bg-slate-900 border border-slate-700 text-amber-300 font-mono text-xs">{part.slice(1, -1)}</code>;
      }
      return part;
    });
  };

  const renderFormattedMessage = (content) => {
    if (!content) return null;

    if (content.includes('|') && content.includes('\n|')) {
      const lines = content.split('\n');
      const tableLines = [];
      const nonTableBefore = [];
      const nonTableAfter = [];
      let inTable = false;
      let tableDone = false;

      for (let line of lines) {
        if (line.trim().startsWith('|')) {
          inTable = true;
          tableLines.push(line);
        } else if (inTable && !tableDone) {
          tableDone = true;
          nonTableAfter.push(line);
        } else if (tableDone) {
          nonTableAfter.push(line);
        } else {
          nonTableBefore.push(line);
        }
      }

      if (tableLines.length >= 2) {
        const headers = tableLines[0].split('|').map(c => c.trim()).filter(Boolean);
        const dataRows = tableLines.slice(2).map(row => row.split('|').map(c => c.trim()).filter(Boolean));

        return (
          <div className="space-y-3">
            {nonTableBefore.length > 0 && (
              <div className="whitespace-pre-wrap leading-relaxed text-sm">
                {formatInlineMarkdown(nonTableBefore.join('\n'))}
              </div>
            )}
            
            <div className="overflow-x-auto my-3 rounded-xl border border-slate-700/80 bg-slate-900/90 shadow-md">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-indigo-950/70 border-b border-slate-700 text-indigo-300 font-bold">
                    {headers.map((h, idx) => (
                      <th key={idx} className="p-3 whitespace-nowrap text-xs">{formatInlineMarkdown(h)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800 text-slate-200 text-xs">
                  {dataRows.map((row, rIdx) => (
                    <tr key={rIdx} className="hover:bg-slate-800/50 transition-colors">
                      {row.map((cell, cIdx) => (
                        <td key={cIdx} className="p-3">{formatInlineMarkdown(cell)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {nonTableAfter.length > 0 && (
              <div className="whitespace-pre-wrap leading-relaxed text-sm">
                {formatInlineMarkdown(nonTableAfter.join('\n'))}
              </div>
            )}
          </div>
        );
      }
    }

    return (
      <div className="whitespace-pre-wrap leading-relaxed text-sm">
        {formatInlineMarkdown(content)}
      </div>
    );
  };

  const QUICK_PROMPTS = [
    { label: "📊 Financial Summary", prompt: "Give me my financial summary" },
    { label: "💵 Add ₹10,000 Salary", prompt: "Add ₹10,000 to my salary" },
    { label: "🏦 Add ₹5 Lakh Loan", prompt: "Add a personal loan of ₹5 lakh" },
    { label: "📈 Invest ₹50,000 Mutual Funds", prompt: "I invested ₹50,000 in mutual funds" },
    { label: "💳 Credit Limit ₹1 Lakh", prompt: "My credit card limit is ₹1 lakh" },
    { label: "🛡️ What is my Credit Score?", prompt: "What is my current credit score?" },
    { label: "💼 How much have I invested?", prompt: "How much have I invested?" },
    { label: "🏦 How much loan do I have?", prompt: "How much loan do I currently have?" },
    { label: "🍕 Add ₹350 Pizza Expense", prompt: "Spent ₹350 on pizza" }
  ];

  const netCashFlow = summaryData?.cash_flow?.net_cash_flow || 0;
  const totalInc = summaryData?.cash_flow?.monthly_income || 0;
  const totalExp = summaryData?.cash_flow?.monthly_expenses || 0;
  const healthScore = summaryData?.financial_health_score?.score ?? 0;

  return (
    <div className="space-y-3 animate-in fade-in duration-500 w-full h-[calc(100vh-4.2rem)] flex flex-col">
      {/* Hero Header & Live Financial Metrics Bar */}
      <div className="glass-panel p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 border-indigo-500/30 bg-gradient-to-r from-indigo-950/30 via-slate-900/50 to-slate-900/50 flex-shrink-0">
        <div className="flex items-center gap-3">
          <button 
            onClick={() => setSidebarOpen(!sidebarOpen)} 
            className="p-2 rounded-xl bg-slate-800 text-slate-300 hover:text-white border border-slate-700 transition-colors cursor-pointer"
            title="Toggle Command Sessions Sidebar"
          >
            {sidebarOpen ? <ChevronLeft className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
          </button>
          <div className="p-3 rounded-2xl bg-gradient-to-tr from-indigo-600 to-purple-600 shadow-lg shadow-indigo-500/30">
            <Bot className="w-6 h-6 text-white animate-pulse" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
              AI Financial Agent Hub
              <Sparkles className="w-4 h-4 text-amber-400" />
            </h2>
            <p className="text-xs text-slate-400">
              Central Intelligence Layer • Action-Oriented System • Real-Time Database Sync.
            </p>
          </div>
        </div>

        {/* Live Context Metrics */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="px-3.5 py-2 rounded-xl bg-slate-800/80 border border-slate-700/60 text-xs">
            <span className="text-[10px] text-slate-400 block">Monthly Income</span>
            <strong className="text-emerald-400 font-bold text-sm">{formatCurrency(totalInc)}</strong>
          </div>
          <div className="px-3.5 py-2 rounded-xl bg-slate-800/80 border border-slate-700/60 text-xs">
            <span className="text-[10px] text-slate-400 block">Monthly Expenses</span>
            <strong className="text-rose-400 font-bold text-sm">{formatCurrency(totalExp)}</strong>
          </div>
          <div className="px-3.5 py-2 rounded-xl bg-slate-800/80 border border-slate-700/60 text-xs">
            <span className="text-[10px] text-slate-400 block">Net Savings</span>
            <strong className="text-indigo-300 font-bold text-sm">{formatCurrency(netCashFlow)}</strong>
          </div>
          <div className="px-3.5 py-2 rounded-xl bg-slate-800/80 border border-indigo-500/30 text-xs bg-indigo-950/30">
            <span className="text-[10px] text-indigo-300 block">Health Score</span>
            <strong className="text-amber-400 font-bold text-sm">{healthScore} / 100</strong>
          </div>
        </div>
      </div>

      {/* Main Chat Workspace Layout */}
      <div className="glass-panel flex-1 flex overflow-hidden border-slate-800 shadow-2xl relative">
        {/* Chat Sessions History Sidebar */}
        {sidebarOpen && (
          <aside className="w-72 md:w-80 bg-slate-900/90 border-r border-slate-800 flex flex-col flex-shrink-0 animate-in slide-in-from-left duration-200">
            <div className="p-4 border-b border-slate-800">
              <button
                onClick={startNewChat}
                className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-bold text-xs shadow-lg shadow-indigo-500/20 hover:opacity-95 transition-all cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>+ New Financial Session</span>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-1.5 text-xs">
              <div className="px-3 py-1.5 text-[10px] font-semibold text-slate-400 uppercase tracking-wider flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-indigo-400" /> Recent Sessions
                </span>
                {sessions.length > 0 && (
                  <button
                    onClick={clearAllSessions}
                    className="hover:text-rose-400 text-slate-500 transition-colors cursor-pointer text-[10px] flex items-center gap-1"
                    title="Clear All Saved History"
                  >
                    <Trash2 className="w-3 h-3" /> Clear All
                  </button>
                )}
              </div>

              {sessions.length === 0 ? (
                <div className="p-4 text-center text-slate-500 text-[11px]">
                  No session history yet. Ask or command the AI Financial Agent below!
                </div>
              ) : (
                sessions.map((s) => {
                  const isActive = s.session_id === sessionId;
                  return (
                    <div
                      key={s.session_id}
                      onClick={() => loadSession(s.session_id)}
                      className={`group flex items-center justify-between p-3 rounded-xl cursor-pointer transition-all ${
                        isActive
                          ? 'bg-indigo-600/30 text-indigo-200 border border-indigo-500/40 font-semibold'
                          : 'text-slate-400 hover:bg-slate-800/80 hover:text-slate-200 border border-transparent'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0 pr-1">
                        <MessageSquare className={`w-4 h-4 flex-shrink-0 ${isActive ? 'text-indigo-400' : 'text-slate-500'}`} />
                        <span className="truncate text-xs">{s.title || 'Financial Session'}</span>
                      </div>
                      <button
                        onClick={(e) => deleteSession(e, s.session_id)}
                        className="opacity-0 group-hover:opacity-100 p-1 hover:text-rose-400 text-slate-500 transition-opacity cursor-pointer"
                        title="Delete Session"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </aside>
        )}

        {/* Central Chat Feed Container */}
        <div className="flex-1 flex flex-col min-w-0 bg-slate-950/40">
          <div className="flex-1 p-6 overflow-y-auto space-y-5 text-sm flex flex-col justify-between">
            {messages.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center p-8 space-y-4">
                <div className="p-4 rounded-2xl bg-indigo-600/20 text-indigo-400 border border-indigo-500/30">
                  <Bot className="w-10 h-10 animate-pulse" />
                </div>
                <div className="space-y-1 max-w-lg">
                  <h3 className="text-xl font-bold text-slate-200">AI Financial Agent Ready</h3>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Commands execute real database operations and keep Dashboard, Investments, Loans, Credit, and Credit Score modules synchronized in real-time.
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-5">
                {messages.map((msg, index) => {
                  const isUser = msg.sender === 'user';
                  return (
                    <div
                      key={index}
                      className={`flex gap-3.5 ${isUser ? 'flex-row-reverse' : 'flex-row'} animate-in fade-in duration-300`}
                    >
                      <div className={`p-2.5 rounded-xl h-9 w-9 flex items-center justify-center flex-shrink-0 shadow-md ${
                        isUser ? 'bg-indigo-600 text-white' : 'bg-gradient-to-tr from-purple-600 to-indigo-600 text-white'
                      }`}>
                        {isUser ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
                      </div>
                      <div className={`p-5 rounded-2xl max-w-[92%] leading-relaxed space-y-2 ${
                        isUser 
                          ? 'bg-indigo-600 text-white rounded-tr-none shadow-md shadow-indigo-500/20 font-medium' 
                          : 'bg-slate-800/90 text-slate-100 rounded-tl-none border border-slate-700/80 shadow-md'
                      }`}>
                        {renderFormattedMessage(msg.message)}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {loading && (
              <div className="flex items-center gap-3 pt-2">
                <div className="p-2.5 rounded-xl bg-purple-600 text-white animate-pulse">
                  <Bot className="w-4 h-4" />
                </div>
                <div className="px-4 py-3 rounded-2xl bg-slate-800 border border-slate-700 text-slate-400 text-xs flex items-center gap-2">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin text-indigo-400" />
                  <span>AI Agent executing tool & synchronizing database...</span>
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Quick Prompts Bar */}
          <div className="px-4 py-2 bg-slate-900/90 border-t border-slate-800 flex gap-2 overflow-x-auto text-[11px] shrink-0">
            {QUICK_PROMPTS.map((qp, idx) => (
              <button
                key={idx}
                onClick={() => handleSendText(qp.prompt)}
                className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-indigo-600/30 text-slate-300 hover:text-white border border-slate-700/80 whitespace-nowrap transition-colors cursor-pointer font-medium"
              >
                {qp.label}
              </button>
            ))}
          </div>

          {/* Input Box */}
          <div className="p-4 bg-slate-900 border-t border-slate-800 space-y-2 flex-shrink-0">
            <form onSubmit={handleFormSubmit} className="flex gap-3">
              <input
                type="text"
                placeholder="Command AI (e.g. 'Add ₹10,000 to my salary', 'Add a personal loan of ₹5 lakh', 'Give me my financial summary')..."
                value={inputMsg}
                onChange={(e) => setInputMsg(e.target.value)}
                className="flex-1 px-5 py-3.5 rounded-xl bg-slate-800/90 border border-slate-700 text-slate-100 placeholder-slate-400 text-sm focus:outline-none focus:border-indigo-500 shadow-inner"
              />
              <button
                type="submit"
                disabled={loading || !inputMsg.trim()}
                className="px-6 py-3.5 rounded-xl bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 text-white font-semibold text-sm shadow-lg shadow-indigo-500/30 hover:opacity-90 transition-all flex items-center gap-2 disabled:opacity-50 cursor-pointer"
              >
                <span>Execute</span>
                <Send className="w-4 h-4" />
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AIChatCenter;
