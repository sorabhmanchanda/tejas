// =============================================
// Logging endpoints: meal / workout / water / weight / sleep + today summary.
// Anna also parses free-text / voice meal descriptions here.
// =============================================

import { Router } from 'express';
import db from '../db/database.js';
import { callAI, parseJsonResponse, hasApiKey } from '../lib/ai.js';

const router = Router();

const MEAL_TYPES = new Set(['breakfast', 'lunch', 'dinner', 'snack']);
const WORKOUT_TYPES = new Set(['gym', 'run', 'cardio', 'mobility', 'rest']);

function clampNum(value, { min = -Infinity, max = Infinity, fallback = 0 } = {}) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function recordEpisode(agentId, content, sourceTable, sourceId) {
  db.prepare(
    'INSERT INTO episodes (agent_id, content, source_table, source_id) VALUES (?, ?, ?, ?)'
  ).run(agentId, content, sourceTable, sourceId);
}

// ---- Today summary (drives the live totals + rings) -------------------------
router.get('/today', (_req, res) => {
  const meals = db
    .prepare("SELECT * FROM meals WHERE date(logged_at) = date('now','localtime') ORDER BY logged_at")
    .all();
  const water = db
    .prepare(
      "SELECT COALESCE(SUM(amount_ml),0) AS ml FROM water_log WHERE date(logged_at) = date('now','localtime')"
    )
    .get();
  const workout = db
    .prepare(
      "SELECT * FROM workouts WHERE date(completed_at) = date('now','localtime') ORDER BY completed_at DESC LIMIT 1"
    )
    .get();
  const lastWeight = db
    .prepare('SELECT weight_kg, logged_at FROM weight_log ORDER BY logged_at DESC LIMIT 1')
    .get();
  const sleep = db
    .prepare('SELECT * FROM sleep_log ORDER BY created_at DESC LIMIT 1')
    .get();

  const totals = meals.reduce(
    (acc, m) => ({
      calories: acc.calories + m.calories,
      protein_g: acc.protein_g + m.protein_g,
      carbs_g: acc.carbs_g + m.carbs_g,
      fat_g: acc.fat_g + m.fat_g,
    }),
    { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 }
  );

  res.json({
    meals,
    totals,
    water_ml: water.ml,
    workout: workout ?? null,
    last_weight: lastWeight ?? null,
    last_sleep: sleep ?? null,
  });
});

// ---- Meal: manual / photo result / voice|text -------------------------------
router.post('/meal', (req, res) => {
  const {
    meal_type,
    food_name,
    portion_notes,
    calories,
    protein_g,
    carbs_g,
    fat_g,
    fiber_g,
    source = 'manual',
    photo_path,
    confidence,
  } = req.body ?? {};

  if (!MEAL_TYPES.has(meal_type)) {
    return res.status(400).json({ error: 'meal_type must be breakfast|lunch|dinner|snack' });
  }
  if (typeof food_name !== 'string' || food_name.trim().length === 0) {
    return res.status(400).json({ error: 'food_name is required' });
  }

  const info = db
    .prepare(
      `INSERT INTO meals (meal_type, food_name, portion_notes, calories, protein_g, carbs_g, fat_g, fiber_g, source, photo_path, confidence)
       VALUES (@meal_type, @food_name, @portion_notes, @calories, @protein_g, @carbs_g, @fat_g, @fiber_g, @source, @photo_path, @confidence)`
    )
    .run({
      meal_type,
      food_name: food_name.trim().slice(0, 300),
      portion_notes: portion_notes ?? null,
      calories: Math.round(clampNum(calories, { min: 0, max: 10000 })),
      protein_g: clampNum(protein_g, { min: 0, max: 1000 }),
      carbs_g: clampNum(carbs_g, { min: 0, max: 2000 }),
      fat_g: clampNum(fat_g, { min: 0, max: 1000 }),
      fiber_g: clampNum(fiber_g, { min: 0, max: 500 }),
      source: ['manual', 'photo', 'voice'].includes(source) ? source : 'manual',
      photo_path: photo_path ?? null,
      confidence: clampNum(confidence, { min: 0, max: 1, fallback: 1 }),
    });

  recordEpisode('anna', `Logged ${meal_type}: ${food_name}`, 'meals', info.lastInsertRowid);
  const meal = db.prepare('SELECT * FROM meals WHERE id = ?').get(info.lastInsertRowid);
  res.json({ meal });
});

// Anna parses "had 2 rotis and dal for lunch" -> structured macros (no save).
const PARSE_SYSTEM = `You parse meal descriptions into nutrition data. User is Indian, eggetarian.
Default portions to typical home-cooked Indian servings unless specified.
Return JSON only:
{
  "food_name": "concise summary",
  "calories": number,
  "protein_g": number,
  "carbs_g": number,
  "fat_g": number,
  "fiber_g": number,
  "confidence": 0.0-1.0
}`;

router.post('/meal/parse', async (req, res) => {
  const { text, meal_type = 'snack' } = req.body ?? {};
  if (typeof text !== 'string' || text.trim().length === 0) {
    return res.status(400).json({ error: 'text is required' });
  }
  if (!hasApiKey()) {
    return res.json({
      parsed: {
        food_name: text.trim().slice(0, 120),
        calories: 350,
        protein_g: 14,
        carbs_g: 45,
        fat_g: 10,
        fiber_g: 6,
        confidence: 0.4,
      },
      mock: true,
    });
  }
  try {
    const out = await callAI({
      maxTokens: 600,
      json: true,
      system: PARSE_SYSTEM,
      messages: [{ role: 'user', content: `Meal type: ${meal_type}\nDescription: ${text}` }],
    });
    res.json({ parsed: parseJsonResponse(out) });
  } catch (e) {
    console.error('[meal/parse]', e.message);
    res.status(502).json({ error: 'Could not parse meal right now' });
  }
});

// ---- Workout ----------------------------------------------------------------
router.post('/workout', (req, res) => {
  const { workout_type, workout_name, duration_min, calories_burned, intensity, rpe, notes, sets } =
    req.body ?? {};
  if (!WORKOUT_TYPES.has(workout_type)) {
    return res.status(400).json({ error: 'invalid workout_type' });
  }

  const info = db
    .prepare(
      `INSERT INTO workouts (workout_type, workout_name, duration_min, calories_burned, intensity, rpe, notes)
       VALUES (@workout_type, @workout_name, @duration_min, @calories_burned, @intensity, @rpe, @notes)`
    )
    .run({
      workout_type,
      workout_name: workout_name?.slice(0, 120) ?? null,
      duration_min: Math.round(clampNum(duration_min, { min: 0, max: 600 })),
      calories_burned: Math.round(clampNum(calories_burned, { min: 0, max: 5000 })),
      intensity: ['low', 'moderate', 'high'].includes(intensity) ? intensity : null,
      rpe: Math.round(clampNum(rpe, { min: 0, max: 10 })),
      notes: notes?.slice(0, 1000) ?? null,
    });

  if (Array.isArray(sets)) {
    const setStmt = db.prepare(
      `INSERT INTO exercise_sets (workout_id, exercise_name, set_number, reps, weight_kg, distance_km, pace_min_km, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    );
    sets.slice(0, 100).forEach((s, i) => {
      if (!s?.exercise_name) return;
      setStmt.run(
        info.lastInsertRowid,
        String(s.exercise_name).slice(0, 120),
        Number(s.set_number) || i + 1,
        s.reps != null ? Math.round(clampNum(s.reps, { min: 0, max: 1000 })) : null,
        s.weight_kg != null ? clampNum(s.weight_kg, { min: 0, max: 1000 }) : null,
        s.distance_km != null ? clampNum(s.distance_km, { min: 0, max: 1000 }) : null,
        s.pace_min_km != null ? clampNum(s.pace_min_km, { min: 0, max: 60 }) : null,
        s.notes?.slice(0, 300) ?? null
      );
    });
  }

  recordEpisode('bala', `Completed ${workout_name || workout_type}`, 'workouts', info.lastInsertRowid);
  const workout = db.prepare('SELECT * FROM workouts WHERE id = ?').get(info.lastInsertRowid);
  res.json({ workout });
});

// ---- Water ------------------------------------------------------------------
router.post('/water', (req, res) => {
  const amount = Math.round(clampNum(req.body?.amount_ml, { min: 1, max: 5000, fallback: 250 }));
  const info = db.prepare('INSERT INTO water_log (amount_ml) VALUES (?)').run(amount);
  recordEpisode('nidra', `Drank ${amount}ml water`, 'water_log', info.lastInsertRowid);
  const today = db
    .prepare(
      "SELECT COALESCE(SUM(amount_ml),0) AS ml FROM water_log WHERE date(logged_at) = date('now','localtime')"
    )
    .get();
  res.json({ added_ml: amount, total_ml: today.ml });
});

// ---- Weight -----------------------------------------------------------------
router.post('/weight', (req, res) => {
  const weight = clampNum(req.body?.weight_kg, { min: 20, max: 400, fallback: NaN });
  if (!Number.isFinite(weight)) return res.status(400).json({ error: 'valid weight_kg required' });
  const bf = req.body?.body_fat_pct != null ? clampNum(req.body.body_fat_pct, { min: 1, max: 70 }) : null;
  const info = db
    .prepare('INSERT INTO weight_log (weight_kg, body_fat_pct) VALUES (?, ?)')
    .run(weight, bf);
  // Keep the profile's current weight in sync so targets recompute correctly.
  db.prepare('UPDATE user_profile SET current_weight_kg = ?, updated_at = CURRENT_TIMESTAMP WHERE id = 1').run(weight);
  recordEpisode('agni', `Weighed in at ${weight}kg`, 'weight_log', info.lastInsertRowid);
  res.json({ weight_kg: weight });
});

router.get('/weight/history', (req, res) => {
  const days = Math.round(clampNum(req.query?.days, { min: 1, max: 365, fallback: 7 }));
  const rows = db
    .prepare(
      `SELECT weight_kg, date(logged_at) AS day, logged_at
       FROM weight_log
       WHERE logged_at >= datetime('now', ?, 'localtime')
       ORDER BY logged_at`
    )
    .all(`-${days} days`);
  res.json({ history: rows });
});

// ---- Sleep ------------------------------------------------------------------
router.post('/sleep', (req, res) => {
  const { bedtime, wake_time, duration_hours, quality, notes } = req.body ?? {};
  const info = db
    .prepare(
      `INSERT INTO sleep_log (bedtime, wake_time, duration_hours, quality, notes)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(
      bedtime ?? null,
      wake_time ?? null,
      duration_hours != null ? clampNum(duration_hours, { min: 0, max: 24 }) : null,
      quality != null ? Math.round(clampNum(quality, { min: 1, max: 10 })) : null,
      notes?.slice(0, 500) ?? null
    );
  recordEpisode('nidra', `Slept ${duration_hours ?? '?'}h`, 'sleep_log', info.lastInsertRowid);
  res.json({ id: info.lastInsertRowid });
});

export default router;
