import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../lib/api.js';

const SANSKRIT = { anna: 'अन्न', agni: 'अग्नि', bala: 'बल', nidra: 'निद्रा', sage: 'सेज' };

function Bubble({ msg }) {
  if (msg.role === 'system') {
    return (
      <div className="flex justify-center py-1">
        <p className="max-w-[90%] rounded-full border border-line bg-base/60 px-3 py-1 text-center text-[11px] text-zinc-500">
          {msg.content}
        </p>
      </div>
    );
  }

  const color = msg.agent_color || '#71717a';
  const name = msg.agent_name || msg.agent_id;

  return (
    <div className="flex gap-2">
      <div
        className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg text-[10px] font-bold"
        style={{ backgroundColor: `${color}22`, color }}
      >
        {(name || '?')[0]}
      </div>
      <div className="min-w-0 flex-1">
        <div className="mb-0.5 flex items-baseline gap-2">
          <span className="text-xs font-semibold" style={{ color }}>
            {name}
          </span>
          {SANSKRIT[msg.agent_id] && (
            <span className="text-[10px] text-zinc-600">{SANSKRIT[msg.agent_id]}</span>
          )}
        </div>
        <p className="rounded-xl rounded-tl-sm border border-line bg-card/80 px-3 py-2 text-sm leading-relaxed text-zinc-200">
          {msg.content}
        </p>
      </div>
    </div>
  );
}

export default function FleetThread({ refreshKey = 0 }) {
  const [messages, setMessages] = useState([]);
  const [active, setActive] = useState(false);
  const lastIdRef = useRef(0);
  const scrollRef = useRef(null);

  const load = useCallback(async (full = false) => {
    try {
      const since = full ? 0 : lastIdRef.current;
      const data = await api.getFleetMessages(since);
      const incoming = data.messages || [];
      if (full) {
        setMessages(incoming);
        lastIdRef.current = incoming.length ? Math.max(...incoming.map((m) => m.id)) : 0;
      } else if (incoming.length) {
        setMessages((prev) => [...prev, ...incoming]);
        lastIdRef.current = Math.max(lastIdRef.current, ...incoming.map((m) => m.id));
      }
      setActive(Boolean(data.active));
    } catch {
      /* backend starting */
    }
  }, []);

  useEffect(() => {
    lastIdRef.current = 0;
    load(true);
  }, [refreshKey, load]);

  useEffect(() => {
    const id = setInterval(() => load(false), active ? 2000 : 8000);
    return () => clearInterval(id);
  }, [load, active]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, active]);

  return (
    <section className="card flex flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <div>
          <h2 className="font-head text-sm font-bold uppercase tracking-[0.18em] text-zinc-400">
            Fleet chat
          </h2>
          <p className="text-[11px] text-zinc-600">Agents coordinate when you log — read-only</p>
        </div>
        {active && (
          <span className="flex items-center gap-1.5 text-xs text-saffron">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-saffron" />
            talking…
          </span>
        )}
      </div>

      <div ref={scrollRef} className="flex max-h-[320px] min-h-[120px] flex-col gap-3 overflow-y-auto p-4">
        {messages.length === 0 && !active && (
          <p className="py-6 text-center text-sm text-zinc-600">
            Log a workout or meal — Bala, Anna, and the fleet will discuss it here.
          </p>
        )}
        {messages.map((m) => (
          <Bubble key={m.id} msg={m} />
        ))}
      </div>
    </section>
  );
}
