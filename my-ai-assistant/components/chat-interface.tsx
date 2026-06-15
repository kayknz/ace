'use client';

import { useState, useEffect, useRef } from 'react';
import { 
  Bot, CornerDownLeft, Square, Trash2, Plus, MessageSquare, Menu, X, Sun, Moon, 
  LogIn, Mail, ShieldAlert
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { MarkdownRenderer } from './markdown-renderer';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

interface ChatSession {
  id: string;
  title: string;
  createdAt: string;
}

export default function ChatInterface() {
  const [user, setUser] = useState<any>(null);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [emailInput, setEmailInput] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [authMessage, setAuthMessage] = useState('');

  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [localInput, setLocalInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false); // Restored for UI feedback
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(true);
  
  const [guestMessages, setGuestMessages] = useState<Message[]>([]);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const root = window.document.documentElement;
    if (isDarkMode) root.classList.add('dark');
    else root.classList.remove('dark');
  }, [isDarkMode]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) {
      setSessions([{ id: 'guest-session', title: 'Temporary Session', createdAt: new Date().toISOString() }]);
      setCurrentSessionId('guest-session');
      return;
    }

    async function loadSessions() {
      const { data, error } = await supabase
        .from('chat_sessions')
        .select('*')
        .order('created_at', { ascending: false });

      if (!error && data) {
        setSessions(data.map(s => ({
          id: s.id,
          title: s.title,
          createdAt: s.created_at
        })));
        if (data.length > 0) setCurrentSessionId(data[0].id);
      }
    }
    loadSessions();
  }, [user]);

  useEffect(() => {
    if (!currentSessionId) {
      setMessages([]);
      return;
    }

    if (currentSessionId === 'guest-session') {
      setMessages(guestMessages);
      return;
    }

    async function loadMessages() {
      const { data, error } = await supabase
        .from('chat_messages')
        .select('*')
        .eq('session_id', currentSessionId)
        .order('created_at', { ascending: true });

      if (!error && data) {
        setMessages(data.map(m => ({
          id: m.id,
          role: m.role as 'user' | 'assistant',
          content: m.content
        })));
      }
    }
    loadMessages();
  }, [currentSessionId, guestMessages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  const handleOAuthLogin = async (provider: 'google' | 'github') => {
    setAuthLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOAuth({ provider });
      if (error) throw error;
    } catch (err: any) {
      setAuthMessage(err.message || 'Authentication failed');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleMagicLinkLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!emailInput.trim()) return;
    setAuthLoading(true);
    setAuthMessage('');
    try {
      const { error } = await supabase.auth.signInWithOtp({ email: emailInput.trim() });
      if (error) throw error;
      setAuthMessage('Magic link sent! Check your inbox.');
    } catch (err: any) {
      setAuthMessage(err.message || 'Failed to send login link');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setGuestMessages([]);
    setMessages([]);
  };

  const createNewSession = async () => {
    if (!user) {
      setIsAuthModalOpen(true);
      return;
    }

    const { data, error } = await supabase
      .from('chat_sessions')
      .insert([{ title: 'New Chat', user_id: user.id }])
      .select()
      .single();

    if (!error && data) {
      setSessions(prev => [{ id: data.id, title: data.title, createdAt: data.created_at }, ...prev]);
      setCurrentSessionId(data.id);
      setMessages([]);
      setIsSidebarOpen(false);
    }
  };

  const deleteSession = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!user) return;

    const { error } = await supabase.from('chat_sessions').delete().eq('id', id);
    if (!error) {
      setSessions(prev => prev.filter(s => s.id !== id));
      if (currentSessionId === id) {
        const remaining = sessions.filter(s => s.id !== id);
        setCurrentSessionId(remaining.length > 0 ? remaining[0].id : null);
      }
    }
  };

  const clearCurrentChat = async () => {
    if (!currentSessionId) return;

    if (!user) {
      setGuestMessages([]);
      setMessages([]);
      return;
    }

    const { error } = await supabase.from('chat_messages').delete().eq('session_id', currentSessionId);
    if (!error) setMessages([]);
  };

  const handleStopGeneration = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      setIsLoading(false);
      setIsStreaming(false);
    }
  };

  const handleFormSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const userQuery = localInput.trim();
    if (!userQuery || isLoading) return;

    setLocalInput('');
    setIsLoading(true);
    setIsStreaming(true);

    const getApiUrl = () => {
      if (typeof window !== 'undefined' && window.location.protocol !== 'http:' && window.location.protocol !== 'https:') {
        return 'http://10.0.2.2:3000';
      }
      return '';
    };

    const userMsgId = crypto.randomUUID();
    const assistantMsgId = crypto.randomUUID();
    const runtimeMessages = [...messages, { id: userMsgId, role: 'user' as const, content: userQuery }];
    
    setMessages(runtimeMessages);
    if (!user) setGuestMessages(runtimeMessages);
    else await supabase.from('chat_messages').insert([{ session_id: currentSessionId, role: 'user', content: userQuery }]);

    setMessages(prev => [...prev, { id: assistantMsgId, role: 'assistant', content: '' }]);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const response = await fetch(`${getApiUrl()}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: runtimeMessages.map(({ role, content }) => ({ role, content })) }),
        signal: controller.signal,
      });

      if (!response.ok || !response.body) throw new Error('Streaming failed');
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let accumulatedText = '';
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmedLine = line.trim();
          if (trimmedLine.startsWith('0:')) {
            try {
              const textChunk = JSON.parse(trimmedLine.slice(2));
              accumulatedText += textChunk;
              setMessages((prev) => prev.map((msg) => 
                msg.id === assistantMsgId ? { ...msg, content: msg.content + textChunk } : msg
              ));
            } catch (e) { console.error(e); }
          }
        }
      }
      
      if (user && currentSessionId) {
        await supabase.from('chat_messages').insert([{ session_id: currentSessionId, role: 'assistant', content: accumulatedText }]);
      }

    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
      setIsStreaming(false);
      abortControllerRef.current = null;
    }
  };

  return (
    <div className="flex h-screen bg-slate-50 dark:bg-slate-950 font-sans transition-colors duration-200 select-none relative">
      
      {/* AUTH MODAL */}
      {isAuthModalOpen && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-md overflow-hidden p-6 shadow-2xl relative space-y-6">
            <button 
              type="button" 
              onClick={() => { setIsAuthModalOpen(false); setAuthMessage(''); }} 
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              <X size={18} />
            </button>
            
            <div className="text-center space-y-2 select-none">
              <div className="mx-auto w-12 h-12 bg-indigo-600/10 dark:bg-indigo-500/10 text-indigo-500 rounded-2xl flex items-center justify-center border border-indigo-500/10 shadow-sm">
                <Bot size={24} />
              </div>
              <h3 className="font-bold text-xl text-slate-800 dark:text-slate-100">Welcome to ACE</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 max-w-[280px] mx-auto leading-relaxed">Sign in to save workspaces securely, sync code history, and resume active sessions.</p>
            </div>

            <div className="space-y-2.5">
              <button 
                type="button" 
                disabled={authLoading}
                onClick={() => handleOAuthLogin('google')}
                className="w-full flex items-center justify-center gap-3 p-3 text-sm font-medium bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800/60 transition-all active:scale-[0.99]"
              >
                <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
                Continue with Google
              </button>
              
              <button 
                type="button"
                disabled={authLoading}
                onClick={() => handleOAuthLogin('github')}
                className="w-full flex items-center justify-center gap-3 p-3 text-sm font-medium bg-slate-900 text-white hover:bg-slate-950 border border-slate-950 dark:border-slate-800 rounded-xl transition-all active:scale-[0.99]"
              >
                <svg className="w-4 h-4 shrink-0 fill-current" viewBox="0 0 24 24">
                  <path d="M12 2A10 10 0 0 0 2 12c0 4.42 2.87 8.17 6.84 9.5.5.08.66-.23.66-.5v-1.69c-2.77.6-3.36-1.34-3.36-1.34-.46-1.16-1.11-1.47-1.11-1.47-.9-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.9 1.52 2.34 1.07 2.91.83.1-.65.35-1.09.63-1.34-2.22-.25-4.55-1.11-4.55-4.92 0-1.11.38-2 1.03-2.71-.1-.25-.45-1.29.1-2.64 0 0 .84-.27 2.75 1.02.79-.22 1.65-.33 2.5-.33.85 0 1.71.11 2.5.33 1.91-1.29 2.75-1.02 2.75-1.02.55 1.35.2 2.39.1 2.64.65.71 1.03 1.6 1.03 2.71 0 3.82-2.34 4.66-4.57 4.91.36.31.69.92.69 1.85V21c0 .27.16.59.67.5C19.14 20.16 22 16.42 22 12A10 10 0 0 0 12 2z"/>
                </svg>
                Continue with GitHub
              </button>
            </div>

            <div className="relative flex py-1 items-center select-none">
              <div className="flex-grow border-t border-slate-200 dark:border-slate-800"></div>
              <span className="flex-shrink mx-3 text-[10px] uppercase font-bold tracking-wider text-slate-400 dark:text-slate-500">or use magic link</span>
              <div className="flex-grow border-t border-slate-200 dark:border-slate-800"></div>
            </div>

            <form onSubmit={handleMagicLinkLogin} className="space-y-2">
              <div className="relative">
                <Mail size={16} className="absolute left-3.5 top-3.5 text-slate-400" />
                <input 
                  type="email" 
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                  placeholder="name@example.com" 
                  required
                  className="w-full bg-slate-50 dark:bg-slate-950 p-3 pl-10 text-sm rounded-xl border border-slate-200 dark:border-slate-800 focus:outline-none focus:border-indigo-500 text-slate-800 dark:text-slate-100" 
                />
              </div>
              <button 
                type="submit" 
                disabled={authLoading}
                className="w-full p-3 text-sm font-semibold bg-indigo-600 hover:bg-indigo-700 transition-colors text-white rounded-xl shadow-lg shadow-indigo-600/10 active:scale-[0.99]"
              >
                {authLoading ? 'Sending link...' : 'Send Magic Link'}
              </button>
            </form>

            {authMessage && (
              <p className="text-center text-xs font-medium text-emerald-500 dark:text-emerald-400 bg-emerald-500/5 p-2.5 rounded-lg border border-emerald-500/10 animate-fadeIn">
                {authMessage}
              </p>
            )}
          </div>
        </div>
      )}

      {/* SIDEBAR */}
      <aside className={`fixed inset-y-0 left-0 z-40 w-64 bg-slate-900 text-white flex flex-col transform transition-transform duration-300 ease-in-out md:static md:translate-x-0 ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="p-4 flex justify-between items-center border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-2 font-semibold text-lg bg-gradient-to-r from-indigo-400 to-cyan-400 bg-clip-text text-transparent">
            <Bot size={22} className="text-indigo-400" />
            <span>ACE Workspace</span>
          </div>
          <button type="button" onClick={() => setIsSidebarOpen(false)} className="md:hidden p-1.5 hover:bg-slate-800 rounded-lg"><X size={18} /></button>
        </div>
        
        <div className="p-3 shrink-0">
          <button type="button" onClick={createNewSession} className="w-full flex items-center justify-center gap-2 p-3 bg-indigo-600 hover:bg-indigo-700 transition-all font-medium text-sm rounded-xl text-white shadow-lg shadow-indigo-600/10">
            <Plus size={16} /> New Conversation
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-2 py-1 space-y-1">
          {sessions.map(s => (
            <div 
              key={s.id} 
              onClick={() => { 
                if (!user && s.id !== 'guest-session') { setIsAuthModalOpen(true); return; }
                setCurrentSessionId(s.id); 
                setIsSidebarOpen(false); 
              }}
              className={`group flex items-center justify-between p-3 rounded-xl cursor-pointer text-sm font-medium transition-all ${currentSessionId === s.id ? 'bg-indigo-600/15 text-indigo-400 border border-indigo-500/20' : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-200'}`}
            >
              <div className="flex items-center gap-2.5 overflow-hidden">
                <MessageSquare size={16} className={currentSessionId === s.id ? 'text-indigo-400' : 'text-slate-500'} />
                <span className="truncate">{s.title}</span>
              </div>
              {user && s.id !== 'guest-session' && (
                <button type="button" onClick={(e) => deleteSession(s.id, e)} className="opacity-0 group-hover:opacity-100 p-1 rounded-md text-slate-500 hover:text-red-400 transition-all"><Trash2 size={14} /></button>
              )}
            </div>
          ))}
        </div>

        <div className="p-3 border-t border-slate-800 shrink-0 select-none">
          {user ? (
            <div className="flex items-center justify-between p-2 bg-slate-800/40 rounded-xl border border-slate-800">
              <div className="min-w-0 flex-1 pr-2">
                <p className="text-xs font-semibold text-slate-200 truncate">{user.email}</p>
                <p className="text-[10px] text-slate-500 font-medium tracking-wide uppercase mt-0.5">Cloud Synced</p>
              </div>
              <button type="button" onClick={handleLogout} className="p-1.5 hover:bg-slate-700/60 text-slate-400 hover:text-red-400 rounded-lg transition-colors"><Trash2 size={14} /></button>
            </div>
          ) : (
            <button 
              type="button" 
              onClick={() => setIsAuthModalOpen(true)}
              className="w-full flex items-center justify-center gap-2 p-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs rounded-xl transition-all border border-slate-700/40 active:scale-[0.98]"
            >
              <LogIn size={14} /> Sign In to Workspace
            </button>
          )}
        </div>
      </aside>

      {/* CHAT AREA */}
      <div className="flex-1 flex flex-col min-w-0 relative h-full">
        <header className="h-16 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center px-4 shrink-0 shadow-sm">
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => setIsSidebarOpen(true)} className="md:hidden p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl text-slate-600 dark:text-slate-300"><Menu size={20} /></button>
            <h1 className="font-semibold text-slate-800 dark:text-slate-100 text-sm truncate max-w-[200px] md:max-w-xs">
              {sessions.find(s => s.id === currentSessionId)?.title || 'ACE Workspace'}
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setIsDarkMode(p => !p)} className="p-2 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-600 dark:text-slate-300 transition-colors">
              {isDarkMode ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            {messages.length > 0 && (
              <button type="button" onClick={clearCurrentChat} className="flex items-center gap-1 px-3 py-2 text-xs font-semibold bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 rounded-xl text-red-500 transition-colors">
                <Trash2 size={14} /> <span>{user ? 'Clear Chat' : 'Reset Context'}</span>
              </button>
            )}
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6 bg-slate-50/50 dark:bg-slate-950/40 select-text">
          {messages.length === 0 && !isStreaming ? (
            <div className="h-full flex flex-col justify-center items-center text-center max-w-md mx-auto space-y-3 select-none">
              <div className="p-4 bg-indigo-600/10 dark:bg-indigo-500/5 text-indigo-500 rounded-3xl border border-indigo-500/10 shadow-inner"><Bot size={40} /></div>
              <h2 className="font-bold text-xl text-slate-800 dark:text-slate-200">Apex Coding Environment</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
                {!user ? "You are using a temporary local sandbox. Sign in to maintain dedicated project sidebars permanently." : "Your dedicated production workspace is active and synced securely."}
              </p>
            </div>
          ) : (
            <>
              {!user && messages.length > 0 && (
                <div className="max-w-4xl mx-auto flex items-center gap-2 px-4 py-2.5 bg-amber-500/10 border border-amber-500/20 rounded-xl text-xs text-amber-600 dark:text-amber-400 select-none animate-fadeIn">
                  <ShieldAlert size={14} className="shrink-0" />
                  <span>You're typing inside a temporary sandbox. The current log will clear on page reload. <button type="button" onClick={() => setIsAuthModalOpen(true)} className="underline font-semibold ml-1 hover:text-amber-700 dark:hover:text-amber-300">Save workspace</button></span>
                </div>
              )}

              {messages.map((m) => (
                <div key={m.id} className={`flex gap-4 max-w-4xl mx-auto ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  {m.role === 'assistant' && (
                    <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-500 to-indigo-600 text-white flex items-center justify-center shadow-md shadow-indigo-500/20 shrink-0 mt-0.5"><Bot size={16} /></div>
                  )}
                  <div className={`max-w-[85%] px-4 py-3 rounded-2xl shadow-sm border text-sm leading-relaxed ${m.role === 'user' ? 'bg-indigo-600 border-indigo-700 text-white rounded-br-none shadow-indigo-600/10 whitespace-pre-wrap' : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 rounded-bl-none'}`}>
                    {m.role === 'assistant' ? (
                      <MarkdownRenderer content={m.content} />
                    ) : (
                      m.content
                    )}
                  </div>
                </div>
              ))}

              {isStreaming && (
                <div className="flex gap-4 max-w-4xl mx-auto justify-start">
                  <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-500 to-indigo-600 text-white flex items-center justify-center shadow-md shadow-indigo-500/20 shrink-0 mt-0.5"><Bot size={16} /></div>
                  <div className="px-4 py-3 rounded-2xl shadow-sm border bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 rounded-bl-none flex items-center">
                    <div className="flex gap-1.5 items-center select-none">
                      <div className="w-2 h-2 rounded-full bg-slate-400 dark:bg-slate-500 animate-bounce [animation-delay:-0.3s]" />
                      <div className="w-2 h-2 rounded-full bg-slate-400 dark:bg-slate-500 animate-bounce [animation-delay:-0.15s]" />
                      <div className="w-2 h-2 rounded-full bg-slate-400 dark:bg-slate-500 animate-bounce" />
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
          <div ref={messagesEndRef} />
        </div>

        <footer className="p-4 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 shrink-0">
          <form onSubmit={handleFormSubmit} className="max-w-4xl mx-auto flex gap-2">
            <input 
              value={localInput} 
              onChange={(e) => setLocalInput(e.target.value)} 
              placeholder={isLoading ? "ACE is processing..." : "Ask ACE anything..."}
              className="flex-1 bg-slate-50 dark:bg-slate-950 p-3 text-sm rounded-xl border border-slate-200 dark:border-slate-800 focus:outline-none focus:border-indigo-500 dark:text-slate-100" 
            />
            {isLoading ? (
              <button type="button" onClick={handleStopGeneration} className="p-3 bg-red-600 text-white rounded-xl hover:bg-red-700 transition-colors shadow-md active:scale-95"><Square size={16} /></button>
            ) : (
              <button type="submit" className="p-3 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-colors shadow-md active:scale-95"><CornerDownLeft className="w-4 h-4" /></button>
            )}
          </form>
        </footer>
      </div>
    </div>
  );
}