import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api.js';

const SANSKRIT = { anna: 'अन्न', agni: 'अग्नि', bala: 'बल', nidra: 'निद्रा', sage: 'सेज' };

const STARTERS = {
  anna: ['Suggest a 40g protein eggetarian breakfast', 'What can I make with paneer and spinach?'],
  agni: ["How's my deficit tracking this week?", 'Am I eating enough protein?'],
  bala: ["What's my workout today?", 'Should I deload soon?'],
  nidra: ['How was my recovery last night?', 'Tips to sleep better before gym days'],
  sage: ['Give me a quick status check', 'What should I focus on this week?'],
};

export default function ChatDrawer({ agent, open, onClose }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const scrollRef = useRef(null);

  useEffect(() => {
    if (!open || !agent) return;
    setMessages([]);
    setInput('');
    api
      .getChat(agent.id)
      .then((d) => setMessages(d.messages || []))
      .catch(() => setMessages([]));
  }, [open, agent]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, sending]);

  async function send(text) {
    const msg = (text ?? input).trim();
    if (!msg || sending) return;
    setInput('');
    setMessages((m) => [...m, { role: 'user', content: msg }]);
    setSending(true);
    try {
      const { reply } = await api.sendChat(agent.id, msg);
      setMessages((m) => [...m, { role: 'assistant', content: reply }]);
    } catch (e) {
      setMessages((m) => [
        ...m,
        { role: 'assistant', content: `(${agent.name} couldn't respond: ${e.message})` },
      ]);
    } finally {
      setSending(false);
    }
  }

  if (!open || !agent) return null;
  const color = agent.color;

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center">
      <div className="absolute inset-0 animate-fadeIn bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 flex h-[78vh] w-full max-w-2xl animate-slideUp flex-col rounded-t-3xl border border-line bg-card shadow-glow">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <div className="flex items-center gap-3">
            <span
              className="grid h-10 w-10 place-items-center rounded-xl font-head text-sm font-bold"
              style={{ backgroundColor: `${color}18`, color }}
            >
              {agent.name[0]}
            </span>
            <div className="leading-tight">
              <div className="flex items-center gap-2">
                <span className="font-head text-base font-bold text-zinc-50">{agent.name}</span>
                <span className="text-sm text-zinc-500">{SANSKRIT[agent.id]}</span>
              </div>
              <div className="text-[11px] text-zinc-400">{agent.role}</div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="grid h-8 w-8 place-items-center rounded-lg border border-line text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
          >
            ✕
          </button>
        </div>

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
          {messages.length === 0 && (
            <div className="space-y-3">
              <p className="text-center text-xs text-zinc-500">
                Chat with {agent.name}. Ask anything in their domain.
              </p>
              <div className="flex flex-wrap justify-center gap-2">
                {(STARTERS[agent.id] || []).map((s) => (
                  <button
                    key={s}
                    onClick={() => send(s)}
                    className="rounded-full border border-line bg-base/60 px-3 py-1.5 text-xs text-zinc-300 transition hover:border-zinc-600"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[80%] whitespace-pre-line rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                  m.role === 'user'
                    ? 'rounded-br-sm bg-saffron/15 text-zinc-100'
                    : 'rounded-bl-sm border border-line bg-base/60 text-zinc-200'
                }`}
                style={m.role === 'assistant' ? { borderColor: `${color}30` } : undefined}
              >
                {m.content}
              </div>
            </div>
          ))}
          {sending && (
            <div className="flex justify-start">
              <div className="flex gap-1 rounded-2xl border border-line bg-base/60 px-4 py-3">
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    className="h-1.5 w-1.5 animate-pulseDot rounded-full bg-zinc-500"
                    style={{ animationDelay: `${i * 0.15}s` }}
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Input */}
        <div className="border-t border-line p-3">
          <div className="flex items-center gap-2">
            <input
              className="input flex-1"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && send()}
              placeholder={`Message ${agent.name}…`}
            />
            <button
              className="btn btn-primary px-4"
              onClick={() => send()}
              disabled={sending || !input.trim()}
            >
              Send
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
