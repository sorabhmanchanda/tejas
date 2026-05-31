// Circular progress ring used in Today's Plan.
export default function ProgressRing({
  value = 0,
  max = 100,
  size = 72,
  stroke = 7,
  color = '#F59E0B',
  label,
  sub,
}) {
  const radius = (size - stroke) / 2;
  const circ = 2 * Math.PI * radius;
  const pct = max > 0 ? Math.min(1, value / max) : 0;
  const offset = circ * (1 - pct);

  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="#1F2428"
            strokeWidth={stroke}
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={circ}
            strokeDashoffset={offset}
            style={{ transition: 'stroke-dashoffset 0.6s cubic-bezier(0.16,1,0.3,1)' }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="num text-sm font-semibold text-zinc-100">{Math.round(pct * 100)}%</span>
        </div>
      </div>
      <div className="text-center leading-tight">
        <div className="text-[11px] font-medium text-zinc-300">{label}</div>
        {sub ? <div className="num text-[10px] text-zinc-500">{sub}</div> : null}
      </div>
    </div>
  );
}
