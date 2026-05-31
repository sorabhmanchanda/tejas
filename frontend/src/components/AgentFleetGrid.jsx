import AgentCard from './AgentCard.jsx';

export default function AgentFleetGrid({ agents, onAgentClick }) {
  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-head text-sm font-bold uppercase tracking-[0.18em] text-zinc-400">
          Agent Fleet
        </h2>
        <span className="num text-xs text-zinc-600">{agents.length} agents online</span>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {agents.map((a) => (
          <AgentCard key={a.id} agent={a} onClick={onAgentClick} />
        ))}
      </div>
    </section>
  );
}
