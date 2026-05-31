import { useEffect, useState } from 'react';

function MiniBar({ value, max, color }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="h-1 w-full overflow-hidden rounded-full bg-line">
      <div
        className="h-full rounded-full transition-all duration-700"
        style={{ width: `${pct}%`, backgroundColor: color }}
      />
    </div>
  );
}

function Stat({ label, value, target, unit, color }) {
  return (
    <div className="min-w-[120px] flex-1">
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <span className="text-[11px] uppercase tracking-wide text-zinc-500">{label}</span>
        <span className="num text-xs text-zinc-300">
          <span className="text-zinc-100">{value}</span>
          <span className="text-zinc-500">
            {' '}
            / {target} {unit}
          </span>
        </span>
      </div>
      <MiniBar value={value} max={target} color={color} />
    </div>
  );
}

// Counts down to the next 6am briefing.
function useNextBriefing() {
  const [label, setLabel] = useState('');
  useEffect(() => {
    const tick = () => {
      const now = new Date();
      const next = new Date(now);
      next.setHours(6, 0, 0, 0);
      if (now >= next) next.setDate(next.getDate() + 1);
      const diff = next - now;
      const h = Math.floor(diff / 3.6e6);
      const m = Math.floor((diff % 3.6e6) / 6e4);
      setLabel(`${h}h ${m}m`);
    };
    tick();
    const id = setInterval(tick, 30000);
    return () => clearInterval(id);
  }, []);
  return label;
}

export default function TopBar({ profile, today, streak = 0 }) {
  const nextBriefing = useNextBriefing();
  const dateStr = new Date().toLocaleDateString('en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
  });

  const calories = Math.round(today?.totals?.calories ?? 0);
  const protein = Math.round(today?.totals?.protein_g ?? 0);
  const water = ((today?.water_ml ?? 0) / 1000).toFixed(1);
  const waterTarget = ((profile?.daily_water_ml ?? 3000) / 1000).toFixed(1);

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-base/85 backdrop-blur-md">
      <div className="mx-auto flex max-w-[1400px] flex-col gap-3 px-4 py-3 lg:flex-row lg:items-center lg:gap-6 lg:px-6">
        {/* Wordmark */}
        <div className="flex items-center gap-3">
          <div className="grid h-9 w-9 place-items-center rounded-xl border border-saffron/30 bg-saffron/10 text-saffron shadow-glow">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2c1.5 3 4 4.5 4 8a4 4 0 1 1-8 0c0-1.2.4-2.2 1-3-.2 2 1 3 1.5 3 .8 0 1-1 .5-2 .8.6 1.5 1.6 1.5 3a2.5 2.5 0 1 1-5 0c0-3.5 3-5 4.5-9z" />
            </svg>
          </div>
          <div className="leading-tight">
            <div className="font-head text-lg font-extrabold tracking-tight text-zinc-50">
              TEJAS
            </div>
            <div className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">
              personal operating system
            </div>
          </div>
        </div>

        {/* Live totals */}
        <div className="flex flex-1 items-center gap-4 rounded-xl border border-line bg-card/60 px-4 py-2">
          <div className="hidden shrink-0 text-xs text-zinc-400 sm:block">{dateStr}</div>
          <div className="flex flex-1 flex-wrap items-center gap-4 sm:gap-6">
            <Stat
              label="Calories"
              value={calories}
              target={profile?.daily_calorie_target ?? 2000}
              unit="kcal"
              color="#F59E0B"
            />
            <Stat
              label="Protein"
              value={protein}
              target={profile?.daily_protein_g ?? 140}
              unit="g"
              color="#84CC16"
            />
            <Stat
              label="Water"
              value={water}
              target={waterTarget}
              unit="L"
              color="#3B82F6"
            />
          </div>
        </div>

        {/* Streak + countdown */}
        <div className="flex items-center gap-3">
          <div className="pill border-saffron/30 bg-saffron/10 text-saffron">
            <span>🔥</span>
            <span className="num font-semibold">{streak}</span>
            <span className="text-saffron/80">days</span>
          </div>
          <div className="hidden flex-col items-end leading-tight sm:flex">
            <span className="text-[10px] uppercase tracking-wide text-zinc-500">next briefing</span>
            <span className="num text-xs text-zinc-300">{nextBriefing}</span>
          </div>
        </div>
      </div>
    </header>
  );
}
