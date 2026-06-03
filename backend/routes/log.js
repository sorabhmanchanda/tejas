// =============================================
// Logging endpoints: meal / workout / water / weight / sleep + today summary.
// Anna also parses free-text / voice meal descriptions here.
// =============================================

import { Router } from 'express';
import db from '../db/database.js';
import { hasApiKey } from '../lib/ai.js';
import { parseMealDescription } from '../lib/mealParse.js';
import { requireLoginId } from '../lib/user.js';
import { triggerFleetDiscussion } from '../lib/fleetChat.js';

const router = Router();
router.use(requireLoginId);

const MEAL_TYPES = new Set(['breakfast', 'lunch', 'dinner', 'snack']);
const WORKOUT_TYPES = new Set(['gym', 'run', 'cardio', 'mobility', 'rest']);

function clampNum(value, { min = -Infinity, max = Infinity, fallback = 0 } = {}) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function recordEpisode(loginId, agentId, content, sourceTable, sourceId) {
  db.prepare(
    'INSERT INTO episodes (login_id, agent_id, content, source_table, source_id) VALUES (?, ?, ?, ?, ?)'
  ).run(loginId, agentId, content, sourceTable, sourceId);
}

// ---- Today summary (drives the live totals + rings) -------------------------
router.get('/today', (req, res) => {
  const { loginId } = req;
  const meals = db
    .prepare(
      `SELECT * FROM meals WHERE login_id = ? AND date(logged_at) = date('now','localtime') ORDER BY logged_at`
    )
    .all(loginId);
  const water = db
    .prepare(
      `SELECT COALESCE(SUM(amount_ml),0) AS ml FROM water_log
       WHERE login_id = ? AND date(logged_at) = date('now','localtime')`
    )
    .get(loginId);
  const workout = db
    .prepare(
      `SELECT * FROM workouts WHERE login_id = ? AND date(completed_at) = date('now','localtime')
       ORDER BY completed_at DESC LIMIT 1`
    )
    .get(loginId);
  const lastWeight = db
    .prepare(
      'SELECT weight_kg, logged_at FROM weight_log WHERE login_id = ? ORDER BY logged_at DESC LIMIT 1'
    )
    .get(loginId);
  const sleep = db
    .prepare('SELECT * FROM sleep_log WHERE login_id = ? ORDER BY created_at DESC LIMIT 1')
    .get(loginId);

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
      `INSERT INTO meals (login_id, meal_type, food_name, portion_notes, calories, protein_g, carbs_g, fat_g, fiber_g, source, photo_path, confidence)
       VALUES (@login_id, @meal_type, @food_name, @portion_notes, @calories, @protein_g, @carbs_g, @fat_g, @fiber_g, @source, @photo_path, @confidence)`
    )
    .run({
      login_id: req.loginId,
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

  recordEpisode(req.loginId, 'anna', `Logged ${meal_type}: ${food_name}`, 'meals', info.lastInsertRowid);
  const meal = db.prepare('SELECT * FROM meals WHERE id = ?').get(info.lastInsertRowid);
  triggerFleetDiscussion(req.loginId, { type: 'meal_logged', meal });
  res.json({ meal });
});

router.post('/meal/parse', async (req, res) => {
  const { text, meal_type = 'snack' } = req.body ?? {};
  if (typeof text !== 'string' || text.trim().length === 0) {
    return res.status(400).json({ error: 'text is required' });
  }
  try {
    const result = await parseMealDescription(text, meal_type);
    res.json(result);
  } catch (e) {
    console.error('[meal/parse]', e.message);
    res.status(400).json({ error: e.message || 'Could not parse meal' });
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
      `INSERT INTO workouts (login_id, workout_type, workout_name, duration_min, calories_burned, intensity, rpe, notes)
       VALUES (@login_id, @workout_type, @workout_name, @duration_min, @calories_burned, @intensity, @rpe, @notes)`
    )
    .run({
      login_id: req.loginId,
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

  recordEpisode(
    req.loginId,
    'bala',
    `Completed ${workout_name || workout_type}`,
    'workouts',
    info.lastInsertRowid
  );
  const workout = db.prepare('SELECT * FROM workouts WHERE id = ?').get(info.lastInsertRowid);
  triggerFleetDiscussion(req.loginId, { type: 'workout_logged', workout });
  res.json({ workout });
});

// ---- Water ------------------------------------------------------------------
router.post('/water', (req, res) => {
  const amount = Math.round(clampNum(req.body?.amount_ml, { min: 1, max: 5000, fallback: 250 }));
  const info = db
    .prepare('INSERT INTO water_log (login_id, amount_ml) VALUES (?, ?)')
    .run(req.loginId, amount);
  recordEpisode(req.loginId, 'nidra', `Drank ${amount}ml water`, 'water_log', info.lastInsertRowid);
  const today = db
    .prepare(
      `SELECT COALESCE(SUM(amount_ml),0) AS ml FROM water_log
       WHERE login_id = ? AND date(logged_at) = date('now','localtime')`
    )
    .get(req.loginId);
  res.json({ added_ml: amount, total_ml: today.ml });
});

// ---- Weight -----------------------------------------------------------------
router.post('/weight', (req, res) => {
  const weight = clampNum(req.body?.weight_kg, { min: 20, max: 400, fallback: NaN });
  if (!Number.isFinite(weight)) return res.status(400).json({ error: 'valid weight_kg required' });
  const bf = req.body?.body_fat_pct != null ? clampNum(req.body.body_fat_pct, { min: 1, max: 70 }) : null;
  const info = db
    .prepare('INSERT INTO weight_log (login_id, weight_kg, body_fat_pct) VALUES (?, ?, ?)')
    .run(req.loginId, weight, bf);
  db.prepare(
    'UPDATE user_profile SET current_weight_kg = ?, updated_at = CURRENT_TIMESTAMP WHERE login_id = ?'
  ).run(weight, req.loginId);
  recordEpisode(req.loginId, 'agni', `Weighed in at ${weight}kg`, 'weight_log', info.lastInsertRowid);
  triggerFleetDiscussion(req.loginId, { type: 'weight_logged', weight_kg: weight });
  res.json({ weight_kg: weight });
});

router.get('/weight/history', (req, res) => {
  const days = Math.round(clampNum(req.query?.days, { min: 1, max: 365, fallback: 7 }));
  const rows = db
    .prepare(
      `SELECT weight_kg, date(logged_at) AS day, logged_at
       FROM weight_log
       WHERE login_id = ? AND logged_at >= datetime('now', ?, 'localtime')
       ORDER BY logged_at`
    )
    .all(req.loginId, `-${days} days`);
  res.json({ history: rows });
});

// ---- Sleep ------------------------------------------------------------------
router.post('/sleep', (req, res) => {
  const { bedtime, wake_time, duration_hours, quality, notes } = req.body ?? {};
  const info = db
    .prepare(
      `INSERT INTO sleep_log (login_id, bedtime, wake_time, duration_hours, quality, notes)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(
      req.loginId,
      bedtime ?? null,
      wake_time ?? null,
      duration_hours != null ? clampNum(duration_hours, { min: 0, max: 24 }) : null,
      quality != null ? Math.round(clampNum(quality, { min: 1, max: 10 })) : null,
      notes?.slice(0, 500) ?? null
    );
  recordEpisode(req.loginId, 'nidra', `Slept ${duration_hours ?? '?'}h`, 'sleep_log', info.lastInsertRowid);
  res.json({ id: info.lastInsertRowid });
});

export default router;
