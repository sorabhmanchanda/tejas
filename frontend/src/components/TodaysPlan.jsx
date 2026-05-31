import ProgressRing from './ProgressRing.jsx';

export default function TodaysPlan({ profile, today, onStartWorkout }) {
  const cals = Math.round(today?.totals?.calories ?? 0);
  const protein = Math.round(today?.totals?.protein_g ?? 0);
  const water = today?.water_ml ?? 0;

  const workoutName = today?.workout?.workout_name ?? 'Push Day — 45 min';
  const workoutDone = Boolean(today?.workout);

  return (
    <section className="card p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-head text-sm font-bold uppercase tracking-[0.16em] text-zinc-300">
          Today's Plan
        </h3>
        <span className="text-[11px] text-zinc-500">{new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>
      </div>

      <div className="mb-4 grid grid-cols-3 gap-2">
        <ProgressRing
          value={cals}
          max={profile?.daily_calorie_target ?? 2000}
          color="#F59E0B"
          label="Calories"
          sub={`${cals}/${profile?.daily_calorie_target ?? 2000}`}
        />
        <ProgressRing
          value={protein}
          max={profile?.daily_protein_g ?? 140}
          color="#84CC16"
          label="Protein"
          sub={`${protein}/${profile?.daily_protein_g ?? 140}g`}
        />
        <ProgressRing
          value={water}
          max={profile?.daily_water_ml ?? 3000}
          color="#3B82F6"
          label="Water"
          sub={`${(water / 1000).toFixed(1)}/${((profile?.daily_water_ml ?? 3000) / 1000).toFixed(1)}L`}
        />
      </div>

      <div className="rounded-xl border border-line bg-base/50 p-3">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[11px] uppercase tracking-wide text-zinc-500">Today's workout</span>
          <span
            className="rounded-md px-1.5 py-0.5 text-[10px] font-semibold"
            style={{
              color: workoutDone ? '#84CC16' : '#3B82F6',
              backgroundColor: workoutDone ? '#84CC1615' : '#3B82F615',
            }}
          >
            {workoutDone ? 'DONE' : 'PLANNED'}
          </span>
        </div>
        <div className="mb-3 flex items-center gap-2">
          <span className="text-lg">🏋️</span>
          <span className="font-head text-sm font-semibold text-zinc-100">{workoutName}</span>
        </div>
        <button
          onClick={onStartWorkout}
          disabled={workoutDone}
          className="btn btn-primary w-full"
        >
          {workoutDone ? 'Workout logged' : 'Start workout'}
        </button>
      </div>
    </section>
  );
}
