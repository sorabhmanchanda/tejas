import { useState } from 'react';
import Modal from './Modal.jsx';
import PhotoUpload from './PhotoUpload.jsx';
import { api } from '../lib/api.js';

function BigButton({ icon, label, hint, onClick, accent }) {
  return (
    <button
      onClick={onClick}
      className="card group flex flex-col items-center gap-1.5 p-3 transition hover:border-zinc-600 hover:shadow-glow active:scale-[0.98]"
      style={{ '--accent': accent }}
    >
      <span
        className="grid h-11 w-11 place-items-center rounded-xl text-xl transition group-hover:scale-110"
        style={{ backgroundColor: `${accent}18`, color: accent }}
      >
        {icon}
      </span>
      <span className="text-xs font-medium text-zinc-200">{label}</span>
      {hint ? <span className="text-[10px] text-zinc-500">{hint}</span> : null}
    </button>
  );
}

function WorkoutForm({ onDone }) {
  const [form, setForm] = useState({
    workout_type: 'gym',
    workout_name: 'Push Day',
    duration_min: 45,
    intensity: 'moderate',
    rpe: 7,
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function submit() {
    setBusy(true);
    setErr('');
    try {
      await api.logWorkout({
        ...form,
        duration_min: Number(form.duration_min),
        rpe: Number(form.rpe),
      });
      onDone?.();
    } catch (e) {
      setErr(e.message);
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <div>
        <span className="label">Type</span>
        <div className="grid grid-cols-4 gap-1.5">
          {['gym', 'run', 'cardio', 'mobility'].map((t) => (
            <button
              key={t}
              onClick={() => setForm((f) => ({ ...f, workout_type: t }))}
              className={`rounded-lg border px-2 py-2 text-xs capitalize transition ${
                form.workout_type === t
                  ? 'border-bala/50 bg-bala/15 text-bala'
                  : 'border-line bg-base/50 text-zinc-400 hover:border-zinc-600'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>
      <div>
        <span className="label">Name</span>
        <input
          className="input"
          value={form.workout_name}
          onChange={(e) => setForm((f) => ({ ...f, workout_name: e.target.value }))}
          placeholder="Push Day / 5K easy run"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <span className="label">Duration (min)</span>
          <input
            type="number"
            className="input num"
            value={form.duration_min}
            onChange={(e) => setForm((f) => ({ ...f, duration_min: e.target.value }))}
          />
        </div>
        <div>
          <span className="label">RPE (1-10)</span>
          <input
            type="number"
            min="1"
            max="10"
            className="input num"
            value={form.rpe}
            onChange={(e) => setForm((f) => ({ ...f, rpe: e.target.value }))}
          />
        </div>
      </div>
      {err && <p className="text-xs text-red-400">{err}</p>}
      <button className="btn btn-primary w-full" onClick={submit} disabled={busy}>
        {busy ? 'Logging…' : 'Log workout'}
      </button>
    </div>
  );
}

function WeightForm({ current, onDone }) {
  const [weight, setWeight] = useState(current ?? '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function submit() {
    setBusy(true);
    setErr('');
    try {
      await api.logWeight(Number(weight));
      onDone?.();
    } catch (e) {
      setErr(e.message);
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <div>
        <span className="label">Weight (kg)</span>
        <input
          type="number"
          step="0.1"
          className="input num text-lg"
          value={weight}
          onChange={(e) => setWeight(e.target.value)}
          placeholder="e.g. 78.4"
          autoFocus
        />
      </div>
      {err && <p className="text-xs text-red-400">{err}</p>}
      <button className="btn btn-primary w-full" onClick={submit} disabled={busy || !weight}>
        {busy ? 'Saving…' : 'Log weight'}
      </button>
    </div>
  );
}

export default function QuickLogBar({ profile, onChanged }) {
  const [modal, setModal] = useState(null); // foodPhoto|foodVoice|workout|weight

  async function quickWater() {
    try {
      await api.logWater(250);
      onChanged?.();
    } catch {
      /* surfaced elsewhere */
    }
  }

  const close = () => setModal(null);
  const done = () => {
    close();
    onChanged?.();
  };

  return (
    <section>
      <h3 className="mb-3 font-head text-sm font-bold uppercase tracking-[0.16em] text-zinc-300">
        Quick Log
      </h3>
      <div className="grid grid-cols-4 gap-2">
        <BigButton icon="📸" label="Food" hint="snap" accent="#84CC16" onClick={() => setModal('foodPhoto')} />
        <BigButton icon="🏋️" label="Workout" hint="log" accent="#3B82F6" onClick={() => setModal('workout')} />
        <BigButton icon="💧" label="Water" hint="+250ml" accent="#06B6D4" onClick={quickWater} />
        <BigButton icon="⚖️" label="Weight" hint="weigh-in" accent="#F59E0B" onClick={() => setModal('weight')} />
      </div>

      {/* Secondary: voice food log */}
      <button
        onClick={() => setModal('foodVoice')}
        className="btn mt-2 w-full justify-center gap-2 text-xs text-zinc-400"
      >
        🎙️ Log food by voice / text
      </button>

      <Modal open={modal === 'foodPhoto'} onClose={close} title="📸 Log food — photo" accent="#84CC16">
        <PhotoUpload mode="photo" onLogged={done} />
      </Modal>
      <Modal open={modal === 'foodVoice'} onClose={close} title="🎙️ Log food — voice" accent="#84CC16">
        <PhotoUpload mode="voice" onLogged={done} />
      </Modal>
      <Modal open={modal === 'workout'} onClose={close} title="🏋️ Log workout" accent="#3B82F6">
        <WorkoutForm onDone={done} />
      </Modal>
      <Modal open={modal === 'weight'} onClose={close} title="⚖️ Log weight" accent="#F59E0B">
        <WeightForm current={profile?.current_weight_kg} onDone={done} />
      </Modal>
    </section>
  );
}
