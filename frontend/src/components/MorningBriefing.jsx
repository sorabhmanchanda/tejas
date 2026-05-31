import { useState } from 'react';
import { api } from '../lib/api.js';

const AGENT_COLORS = {
  anna: '#84CC16',
  agni: '#F59E0B',
  bala: '#3B82F6',
  nidra: '#A855F7',
  sage: '#EC4899',
};

function FindingCard({ finding, onResolve }) {
  const [busy, setBusy] = useState(false);
  const color = finding.agent_color || AGENT_COLORS[finding.agent_id] || '#F59E0B';

  async function act(action) {
    setBusy(true);
    try {
      await api.resolveFinding(finding.id, action);
      onResolve?.(finding.id);
    } catch {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-line bg-base/40 p-3">
      <div className="mb-1.5 flex items-center gap-2">
        <span
          className="rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase"
          style={{ color, backgroundColor: `${color}18` }}
        >
          {finding.agent_name || finding.agent_id}
        </span>
        <span
          className={`text-[10px] uppercase ${
            finding.severity === 'high'
              ? 'text-red-400'
              : finding.severity === 'medium'
                ? 'text-amber-400'
                : 'text-zinc-500'
          }`}
        >
          {finding.severity}
        </span>
      </div>
      <p className="mb-1 text-sm font-medium text-zinc-100">{finding.title}</p>
      <p className="mb-2.5 text-xs leading-relaxed text-zinc-400">{finding.body}</p>
      <div className="flex gap-2">
        <button
          className="btn flex-1 border-green-500/30 bg-green-500/10 py-1.5 text-xs text-green-300 hover:bg-green-500/20"
          onClick={() => act('approve')}
          disabled={busy}
        >
          Approve
        </button>
        <button
          className="btn flex-1 py-1.5 text-xs text-zinc-400"
          onClick={() => act('dismiss')}
          disabled={busy}
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}

export default function MorningBriefing({ briefing, findings, onGenerate, onResolve, generating }) {
  return (
    <section className="card p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-head text-sm font-bold uppercase tracking-[0.16em] text-zinc-300">
          <span className="text-sage">Sage's</span> Briefing
        </h3>
        <button className="text-[11px] text-saffron hover:underline" onClick={onGenerate} disabled={generating}>
          {generating ? 'compiling…' : 'refresh'}
        </button>
      </div>

      {briefing?.content ? (
        <div className="mb-3 whitespace-pre-line rounded-xl border border-sage/20 bg-sage/5 p-3 text-sm leading-relaxed text-zinc-300">
          {briefing.content}
        </div>
      ) : (
        <div className="mb-3 rounded-xl border border-line bg-base/40 p-4 text-center">
          <p className="mb-3 text-sm text-zinc-400">No briefing yet for today.</p>
          <button className="btn btn-primary mx-auto" onClick={onGenerate} disabled={generating}>
            {generating ? 'Compiling…' : 'Generate morning briefing'}
          </button>
        </div>
      )}

      {findings?.length > 0 && (
        <div className="space-y-2">
          <div className="text-[11px] uppercase tracking-wide text-zinc-500">
            Pending findings · {findings.length}
          </div>
          {findings.map((f) => (
            <FindingCard key={f.id} finding={f} onResolve={onResolve} />
          ))}
        </div>
      )}

      {findings?.length === 0 && briefing && (
        <p className="text-center text-xs text-zinc-600">All findings cleared. Nice.</p>
      )}
    </section>
  );
}
