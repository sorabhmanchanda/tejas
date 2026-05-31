import { useMemo, useState } from 'react';
import { api } from '../lib/api.js';
import { computeTargets, ACTIVITY_LABELS } from '../lib/tdee.js';

const ACTIVITY_OPTIONS = Object.keys(ACTIVITY_LABELS);

function Field({ label, children, hint }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-[11px] text-zinc-500">{hint}</span> : null}
    </label>
  );
}

function TargetPreview({ targets }) {
  if (!targets) return null;
  const blocks = [
    { label: 'Calories', value: targets.daily_calorie_target, unit: 'kcal', color: '#F59E0B' },
    { label: 'Protein', value: targets.daily_protein_g, unit: 'g', color: '#84CC16' },
    { label: 'Carbs', value: targets.daily_carb_g, unit: 'g', color: '#3B82F6' },
    { label: 'Fat', value: targets.daily_fat_g, unit: 'g', color: '#A855F7' },
  ];
  return (
    <div className="rounded-xl border border-line bg-base/40 p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[11px] uppercase tracking-wide text-zinc-500">Your daily targets</span>
        <span className="num text-[11px] text-zinc-500">TDEE ≈ {targets.tdee} kcal</span>
      </div>
      <div className="grid grid-cols-4 gap-1.5">
        {blocks.map((b) => (
          <div key={b.label} className="flex flex-col items-center rounded-lg border border-line bg-card/60 px-2 py-2">
            <span className="num text-base font-semibold" style={{ color: b.color }}>
              {b.value}
            </span>
            <span className="text-[9px] uppercase tracking-wide text-zinc-500">
              {b.label}
            </span>
          </div>
        ))}
      </div>
      <div className="mt-2 flex items-center justify-between text-[11px] text-zinc-500">
        <span>💧 Water {(targets.daily_water_ml / 1000).toFixed(1)} L</span>
        <span>Deficit {targets.deficit_kcal} kcal/day</span>
      </div>
      {targets.warnings?.length > 0 && (
        <ul className="mt-2 space-y-1 border-t border-line pt-2">
          {targets.warnings.map((w, i) => (
            <li key={i} className="text-[11px] text-amber-500/90">
              ⚠ {w}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function Onboarding({ onComplete }) {
  const [form, setForm] = useState({
    name: '',
    age: 30,
    heightCm: 175,
    currentWeightKg: 80,
    goalWeightKg: 72,
    activityLevel: 'moderate',
    deficitKcal: 400,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const set = (k) => (e) => {
    const v = e?.target ? e.target.value : e;
    setForm((f) => ({ ...f, [k]: v }));
  };

  const targets = useMemo(
    () =>
      computeTargets({
        weightKg: Number(form.currentWeightKg),
        heightCm: Number(form.heightCm),
        age: Number(form.age),
        activityLevel: form.activityLevel,
        deficitKcal: Number(form.deficitKcal),
      }),
    [form]
  );

  async function submit() {
    if (!form.name.trim()) {
      setError('Please enter your name.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const { profile } = await api.saveProfile(form);
      onComplete?.(profile);
    } catch (e) {
      setError(e.message);
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen px-4 py-8">
      <div className="mx-auto max-w-lg">
        {/* Brand */}
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-2xl border border-saffron/30 bg-saffron/10 text-saffron shadow-glow">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2c1.5 3 4 4.5 4 8a4 4 0 1 1-8 0c0-1.2.4-2.2 1-3-.2 2 1 3 1.5 3 .8 0 1-1 .5-2 .8.6 1.5 1.6 1.5 3a2.5 2.5 0 1 1-5 0c0-3.5 3-5 4.5-9z" />
            </svg>
          </div>
          <h1 className="font-head text-3xl font-extrabold tracking-tight text-zinc-50">TEJAS</h1>
          <p className="mt-1 text-sm text-zinc-400">
            Sanskrit for <span className="text-saffron">radiance</span>. Let's set up your fleet.
          </p>
        </div>

        <div className="card space-y-4 p-5">
          <Field label="Name">
            <input className="input" value={form.name} onChange={set('name')} placeholder="Your name" autoFocus />
          </Field>

          <div className="grid grid-cols-3 gap-3">
            <Field label="Age">
              <input type="number" className="input num" value={form.age} onChange={set('age')} />
            </Field>
            <Field label="Height (cm)">
              <input type="number" className="input num" value={form.heightCm} onChange={set('heightCm')} />
            </Field>
            <Field label="Weight (kg)">
              <input type="number" step="0.1" className="input num" value={form.currentWeightKg} onChange={set('currentWeightKg')} />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Goal weight (kg)">
              <input type="number" step="0.1" className="input num" value={form.goalWeightKg} onChange={set('goalWeightKg')} />
            </Field>
            <Field label="Daily deficit (kcal)" hint="200–500, capped for safety">
              <input
                type="range"
                min="200"
                max="500"
                step="50"
                value={form.deficitKcal}
                onChange={set('deficitKcal')}
                className="mt-3 w-full accent-saffron"
              />
              <div className="num mt-1 text-center text-sm text-saffron">{form.deficitKcal}</div>
            </Field>
          </div>

          <Field label="Activity level">
            <select className="input" value={form.activityLevel} onChange={set('activityLevel')}>
              {ACTIVITY_OPTIONS.map((a) => (
                <option key={a} value={a} className="bg-card">
                  {ACTIVITY_LABELS[a]}
                </option>
              ))}
            </select>
          </Field>

          {/* Locked attributes */}
          <div className="flex gap-2">
            <span className="pill border-anna/30 bg-anna/10 text-anna">🥚 Eggetarian (locked)</span>
            <span className="pill border-saffron/30 bg-saffron/10 text-saffron">🔥 Goal: Cut (locked)</span>
          </div>

          <TargetPreview targets={targets} />

          {error && <p className="text-sm text-red-400">{error}</p>}

          <button className="btn btn-primary w-full py-3" onClick={submit} disabled={saving}>
            {saving ? 'Setting up…' : 'Launch Tejas →'}
          </button>
        </div>

        <p className="mt-4 text-center text-[11px] text-zinc-600">
          Targets use Mifflin-St Jeor with built-in safety floors. Every suggestion is yours to override.
        </p>
      </div>
    </div>
  );
}
