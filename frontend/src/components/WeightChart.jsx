import {
  ResponsiveContainer,
  LineChart,
  Line,
  YAxis,
  XAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';

function StatBlock({ label, value, unit, accent }) {
  return (
    <div className="flex flex-col">
      <span className="text-[10px] uppercase tracking-wide text-zinc-500">{label}</span>
      <span className="num text-lg font-semibold" style={{ color: accent || '#E4E4E7' }}>
        {value}
        {unit ? <span className="ml-0.5 text-xs text-zinc-500">{unit}</span> : null}
      </span>
    </div>
  );
}

export default function WeightChart({ history = [], stats = {} }) {
  const data = history.map((h) => ({
    day: new Date((h.logged_at || h.day).replace(' ', 'T')).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
    }),
    weight: h.weight_kg,
  }));

  const weights = data.map((d) => d.weight);
  const min = weights.length ? Math.min(...weights) - 0.5 : 0;
  const max = weights.length ? Math.max(...weights) + 0.5 : 1;

  return (
    <section className="card p-4">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.4fr_1fr]">
        {/* Mini chart */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="font-head text-sm font-bold uppercase tracking-[0.16em] text-zinc-300">
              7-Day Weight Trend
            </h3>
            {data.length > 1 && (
              <span className="num text-xs text-zinc-500">
                {(data.at(-1).weight - data[0].weight >= 0 ? '+' : '')}
                {(data.at(-1).weight - data[0].weight).toFixed(1)} kg
              </span>
            )}
          </div>
          <div className="h-32">
            {data.length === 0 ? (
              <div className="flex h-full items-center justify-center text-xs text-zinc-600">
                Log your weight to see the trend.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data} margin={{ top: 5, right: 8, left: -20, bottom: 0 }}>
                  <CartesianGrid stroke="#1F2428" vertical={false} />
                  <XAxis
                    dataKey="day"
                    tick={{ fill: '#71717A', fontSize: 10 }}
                    axisLine={{ stroke: '#1F2428' }}
                    tickLine={false}
                  />
                  <YAxis
                    domain={[min, max]}
                    tick={{ fill: '#71717A', fontSize: 10 }}
                    axisLine={false}
                    tickLine={false}
                    width={40}
                  />
                  <Tooltip
                    contentStyle={{
                      background: '#14181B',
                      border: '1px solid #1F2428',
                      borderRadius: 12,
                      fontSize: 12,
                    }}
                    labelStyle={{ color: '#A1A1AA' }}
                    itemStyle={{ color: '#F59E0B' }}
                    formatter={(v) => [`${v} kg`, 'Weight']}
                  />
                  <Line
                    type="monotone"
                    dataKey="weight"
                    stroke="#F59E0B"
                    strokeWidth={2.5}
                    dot={{ r: 3, fill: '#F59E0B' }}
                    activeDot={{ r: 5 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Week stats */}
        <div className="flex items-center justify-around gap-2 border-t border-line pt-3 lg:border-l lg:border-t-0 lg:pl-4 lg:pt-0">
          <StatBlock label="Wk Deficit" value={stats.weeklyDeficit ?? '—'} unit="kcal" accent="#F59E0B" />
          <StatBlock label="Workouts" value={stats.workouts ?? 0} accent="#3B82F6" />
          <StatBlock label="Avg Sleep" value={stats.avgSleep ?? '—'} unit="h" accent="#A855F7" />
        </div>
      </div>
    </section>
  );
}
