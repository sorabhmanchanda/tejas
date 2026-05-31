// Sanskrit names for each agent, shown alongside the English role.
const SANSKRIT = {
  anna: 'अन्न',
  agni: 'अग्नि',
  bala: 'बल',
  nidra: 'निद्रा',
  sage: 'सेज',
};

function StatusDot({ status }) {
  const map = {
    active: 'bg-green-400',
    sleeping: 'bg-amber-400',
    error: 'bg-red-400',
  };
  return (
    <span className="relative flex h-2.5 w-2.5">
      <span
        className={`absolute inline-flex h-full w-full rounded-full opacity-60 ${map[status] || map.active} animate-pulseDot`}
      />
      <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${map[status] || map.active}`} />
    </span>
  );
}

function MetricBadge({ k, v, color }) {
  return (
    <div className="flex flex-col items-center rounded-lg border border-line bg-base/50 px-2 py-1.5">
      <span className="num text-sm font-semibold" style={{ color }}>
        {v}
      </span>
      <span className="text-[9px] uppercase tracking-wide text-zinc-500">{k}</span>
    </div>
  );
}

function tickLabel(ms) {
  const min = Math.round(ms / 60000);
  if (min < 60) return `every ${min}m`;
  return `every ${Math.round(min / 60)}h`;
}

function lastSleepLabel(iso) {
  if (!iso) return 'never slept';
  const d = new Date(iso.replace(' ', 'T'));
  const diff = Date.now() - d.getTime();
  const h = Math.floor(diff / 3.6e6);
  if (h < 1) return 'slept <1h ago';
  if (h < 24) return `slept ${h}h ago`;
  return `slept ${Math.floor(h / 24)}d ago`;
}

export default function AgentCard({ agent, onClick }) {
  const m = agent.metrics || {};
  return (
    <button
      onClick={() => onClick?.(agent)}
      className="card group relative overflow-hidden p-4 text-left transition hover:border-zinc-600/80 hover:shadow-glow"
      style={{ '--accent': agent.color }}
    >
      {/* Accent edge */}
      <span
        className="absolute inset-y-0 left-0 w-1 opacity-80"
        style={{ backgroundColor: agent.color }}
      />

      <div className="mb-3 flex items-start justify-between">
        <div className="flex items-center gap-2.5">
          <StatusDot status={agent.status} />
          <div className="leading-tight">
            <div className="flex items-center gap-2">
              <span className="font-head text-base font-bold text-zinc-50">{agent.name}</span>
              <span className="text-sm text-zinc-500">{SANSKRIT[agent.id]}</span>
            </div>
            <div className="text-[11px] text-zinc-400">{agent.role}</div>
          </div>
        </div>
        <span
          className="rounded-md border px-1.5 py-0.5 text-[10px] font-semibold"
          style={{
            color: agent.color,
            borderColor: `${agent.color}55`,
            backgroundColor: `${agent.color}12`,
          }}
        >
          OK
        </span>
      </div>

      <p className="mb-3 line-clamp-2 text-xs text-zinc-500">{agent.domain}</p>

      <div className="mb-3 grid grid-cols-4 gap-1.5">
        <MetricBadge k="EP" v={m.ep ?? 0} color={agent.color} />
        <MetricBadge k="ENT" v={m.ent ?? 0} color={agent.color} />
        <MetricBadge k="FIND" v={m.find ?? 0} color={agent.color} />
        <MetricBadge k="DS" v={m.ds ?? 0} color={agent.color} />
      </div>

      <div className="flex items-center justify-between text-[10px] text-zinc-600">
        <span className="num">{tickLabel(agent.tick_ms)}</span>
        <span className="num">{lastSleepLabel(agent.last_sleep)}</span>
      </div>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-zinc-700/40 to-transparent opacity-0 transition group-hover:opacity-100" />
    </button>
  );
}
