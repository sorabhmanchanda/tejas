import { useRef, useState } from 'react';
import { api } from '../lib/api.js';
import VoiceInput from './VoiceInput.jsx';

const MEAL_TYPES = ['breakfast', 'lunch', 'dinner', 'snack'];

function guessMealType() {
  const h = new Date().getHours();
  if (h < 11) return 'breakfast';
  if (h < 16) return 'lunch';
  if (h < 21) return 'dinner';
  return 'snack';
}

function NutriRow({ label, value, unit, color }) {
  return (
    <div className="flex flex-col items-center rounded-lg border border-line bg-base/50 px-2 py-2">
      <span className="num text-base font-semibold" style={{ color }}>
        {Math.round(value)}
      </span>
      <span className="text-[10px] uppercase tracking-wide text-zinc-500">
        {label}
        {unit ? ` (${unit})` : ''}
      </span>
    </div>
  );
}

// mode: 'photo' | 'voice'
export default function PhotoUpload({ mode = 'photo', onLogged }) {
  const fileRef = useRef(null);
  const cameraRef = useRef(null);
  const [preview, setPreview] = useState(null);
  const [analysis, setAnalysis] = useState(null);
  const [mealType, setMealType] = useState(guessMealType());
  const [status, setStatus] = useState('idle'); // idle|analyzing|ready|saving|error
  const [error, setError] = useState('');
  const [text, setText] = useState('');

  async function handleFile(file) {
    if (!file) return;
    setError('');
    setPreview(URL.createObjectURL(file));
    setStatus('analyzing');
    try {
      const result = await api.analyzePhoto(file);
      setAnalysis({
        food_name: result.items?.map((i) => i.name).join(', ') || 'Meal',
        items: result.items || [],
        calories: result.total_calories ?? 0,
        protein_g: result.total_protein_g ?? 0,
        carbs_g: result.total_carbs_g ?? 0,
        fat_g: result.total_fat_g ?? 0,
        confidence: result.confidence ?? 0.5,
        notes: result.notes,
        photo_path: result.photo_path,
        mock: result.mock,
      });
      setStatus('ready');
    } catch (e) {
      setError(e.message);
      setStatus('error');
    }
  }

  async function handleParseText(value) {
    const t = (value ?? text).trim();
    if (!t) {
      setError('Say or type what you ate first.');
      return;
    }
    setError('');
    setStatus('analyzing');
    try {
      const { parsed, degraded, note, mock } = await api.parseMeal(t, mealType);
      setAnalysis({
        food_name: parsed.food_name || t,
        items: [],
        calories: parsed.calories ?? 0,
        protein_g: parsed.protein_g ?? 0,
        carbs_g: parsed.carbs_g ?? 0,
        fat_g: parsed.fat_g ?? 0,
        fiber_g: parsed.fiber_g ?? 0,
        confidence: parsed.confidence ?? 0.5,
        notes: degraded ? note : undefined,
        mock: Boolean(mock || degraded),
      });
      setStatus('ready');
    } catch (e) {
      setError(e.message);
      setStatus('error');
    }
  }

  async function save() {
    if (!analysis) return;
    setStatus('saving');
    try {
      await api.logMeal({
        meal_type: mealType,
        food_name: analysis.food_name,
        calories: analysis.calories,
        protein_g: analysis.protein_g,
        carbs_g: analysis.carbs_g,
        fat_g: analysis.fat_g,
        fiber_g: analysis.fiber_g ?? 0,
        source: mode === 'photo' ? 'photo' : 'voice',
        photo_path: analysis.photo_path ?? null,
        confidence: analysis.confidence,
      });
      onLogged?.();
    } catch (e) {
      setError(e.message);
      setStatus('error');
    }
  }

  return (
    <div className="space-y-4">
      {/* Meal type selector */}
      <div>
        <span className="label">Meal</span>
        <div className="grid grid-cols-4 gap-1.5">
          {MEAL_TYPES.map((t) => (
            <button
              key={t}
              onClick={() => setMealType(t)}
              className={`rounded-lg border px-2 py-2 text-xs capitalize transition ${
                mealType === t
                  ? 'border-anna/50 bg-anna/15 text-anna'
                  : 'border-line bg-base/50 text-zinc-400 hover:border-zinc-600'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* PHOTO mode inputs */}
      {mode === 'photo' && status === 'idle' && (
        <div className="grid grid-cols-2 gap-2">
          <input
            ref={cameraRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => handleFile(e.target.files?.[0])}
          />
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(e) => handleFile(e.target.files?.[0])}
          />
          <button className="btn flex-col gap-1 py-5" onClick={() => cameraRef.current?.click()}>
            <span className="text-2xl">📷</span>
            <span className="text-xs">Take photo</span>
          </button>
          <button className="btn flex-col gap-1 py-5" onClick={() => fileRef.current?.click()}>
            <span className="text-2xl">🖼️</span>
            <span className="text-xs">Choose file</span>
          </button>
        </div>
      )}

      {/* VOICE / TEXT mode inputs */}
      {mode === 'voice' && status === 'idle' && (
        <div className="space-y-2">
          <p className="text-xs text-zinc-500">
            Say or type what you ate — e.g. "two rotis, dal tadka and a bowl of curd".
          </p>
          <VoiceInput
            value={text}
            onChange={setText}
            onFinal={(t) => handleParseText(t)}
            placeholder="had 2 rotis and dal for lunch…"
          />
          <button className="btn btn-primary w-full" onClick={() => handleParseText()} disabled={!text.trim()}>
            Parse meal
          </button>
        </div>
      )}

      {/* Preview */}
      {preview && (
        <img
          src={preview}
          alt="meal"
          className="max-h-48 w-full rounded-xl border border-line object-cover"
        />
      )}

      {/* Analyzing */}
      {status === 'analyzing' && (
        <div className="flex items-center justify-center gap-3 rounded-xl border border-line bg-base/50 py-6 text-sm text-zinc-400">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-anna/30 border-t-anna" />
          {mode === 'photo' ? 'Anna is reading your plate…' : 'Parsing what you ate…'}
        </div>
      )}

      {/* Result */}
      {status === 'ready' && analysis && (
        <div className="space-y-3 animate-fadeIn">
          <div className="rounded-xl border border-line bg-base/40 p-3">
            <div className="mb-2 flex items-start justify-between gap-2">
              <p className="text-sm font-medium text-zinc-100">{analysis.food_name}</p>
              <span className="num shrink-0 rounded-md bg-anna/15 px-1.5 py-0.5 text-[10px] text-anna">
                {Math.round((analysis.confidence ?? 0) * 100)}% conf
              </span>
            </div>
            <div className="grid grid-cols-4 gap-1.5">
              <NutriRow label="kcal" value={analysis.calories} color="#F59E0B" />
              <NutriRow label="protein" unit="g" value={analysis.protein_g} color="#84CC16" />
              <NutriRow label="carbs" unit="g" value={analysis.carbs_g} color="#3B82F6" />
              <NutriRow label="fat" unit="g" value={analysis.fat_g} color="#A855F7" />
            </div>
            {analysis.items?.length > 0 && (
              <ul className="mt-3 space-y-1 border-t border-line pt-2">
                {analysis.items.map((it, i) => (
                  <li key={i} className="flex justify-between text-[11px] text-zinc-400">
                    <span>
                      {it.name} <span className="text-zinc-600">· {it.portion}</span>
                    </span>
                    <span className="num text-zinc-500">{Math.round(it.calories)} kcal</span>
                  </li>
                ))}
              </ul>
            )}
            {analysis.notes && (
              <p className="mt-2 text-[11px] italic text-zinc-500">{analysis.notes}</p>
            )}
            {analysis.mock && (
              <p className="mt-1 text-[11px] text-amber-500/80">
                Estimate (no API key set) — numbers are illustrative.
              </p>
            )}
          </div>
          <div className="flex gap-2">
            <button
              className="btn flex-1"
              onClick={() => {
                setStatus('idle');
                setAnalysis(null);
                setPreview(null);
                setText('');
              }}
            >
              Retry
            </button>
            <button className="btn btn-primary flex-1" onClick={save}>
              Log meal
            </button>
          </div>
        </div>
      )}

      {status === 'saving' && (
        <div className="py-2 text-center text-sm text-zinc-400">Saving…</div>
      )}

      {error && (
        <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
          {error}
        </p>
      )}
    </div>
  );
}
