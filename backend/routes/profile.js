// =============================================
// Profile / onboarding. Computes targets with section-7 guardrails and saves.
// =============================================

import { Router } from 'express';
import db from '../db/database.js';
import { computeTargets, calcTDEE } from '../lib/nutrition.js';
import { requireLoginId } from '../lib/user.js';

const router = Router();
router.use(requireLoginId);

const ACTIVITY_LEVELS = new Set(['sedentary', 'light', 'moderate', 'active', 'very_active']);

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : NaN;
}

// GET current profile (null if not onboarded yet).
router.get('/', (req, res) => {
  const profile = db.prepare('SELECT * FROM user_profile WHERE login_id = ?').get(req.loginId);
  res.json({ profile: profile ?? null });
});

// Preview targets without saving (used live in onboarding).
router.post('/preview', (req, res) => {
  const { weightKg, heightCm, age, activityLevel, deficitKcal, override } = req.body ?? {};
  if (
    !Number.isFinite(num(weightKg)) ||
    !Number.isFinite(num(heightCm)) ||
    !Number.isFinite(num(age)) ||
    !ACTIVITY_LEVELS.has(activityLevel)
  ) {
    return res.status(400).json({ error: 'Invalid input for target preview' });
  }
  const targets = computeTargets({
    weightKg: num(weightKg),
    heightCm: num(heightCm),
    age: num(age),
    activityLevel,
    deficitKcal: Number.isFinite(num(deficitKcal)) ? num(deficitKcal) : 400,
    override: Boolean(override),
  });
  res.json({ targets });
});

// Create / replace profile for this login ID.
router.post('/', (req, res) => {
  const {
    name,
    age,
    heightCm,
    currentWeightKg,
    goalWeightKg,
    activityLevel,
    deficitKcal = 400,
    override = false,
  } = req.body ?? {};

  if (typeof name !== 'string' || name.trim().length === 0 || name.length > 80) {
    return res.status(400).json({ error: 'Name is required' });
  }
  if (
    !Number.isFinite(num(age)) ||
    !Number.isFinite(num(heightCm)) ||
    !Number.isFinite(num(currentWeightKg)) ||
    !ACTIVITY_LEVELS.has(activityLevel)
  ) {
    return res.status(400).json({ error: 'Invalid profile input' });
  }

  const targets = computeTargets({
    weightKg: num(currentWeightKg),
    heightCm: num(heightCm),
    age: num(age),
    activityLevel,
    deficitKcal: num(deficitKcal),
    override: Boolean(override),
  });

  const stmt = db.prepare(`
    INSERT INTO user_profile (
      login_id, name, age, height_cm, current_weight_kg, goal_weight_kg,
      activity_level, goal, diet_style, deficit_kcal,
      daily_calorie_target, daily_protein_g, daily_carb_g, daily_fat_g, daily_water_ml,
      updated_at
    ) VALUES (
      @login_id, @name, @age, @height_cm, @current_weight_kg, @goal_weight_kg,
      @activity_level, 'cut', 'eggetarian', @deficit_kcal,
      @daily_calorie_target, @daily_protein_g, @daily_carb_g, @daily_fat_g, @daily_water_ml,
      CURRENT_TIMESTAMP
    )
    ON CONFLICT(login_id) DO UPDATE SET
      name = excluded.name,
      age = excluded.age,
      height_cm = excluded.height_cm,
      current_weight_kg = excluded.current_weight_kg,
      goal_weight_kg = excluded.goal_weight_kg,
      activity_level = excluded.activity_level,
      deficit_kcal = excluded.deficit_kcal,
      daily_calorie_target = excluded.daily_calorie_target,
      daily_protein_g = excluded.daily_protein_g,
      daily_carb_g = excluded.daily_carb_g,
      daily_fat_g = excluded.daily_fat_g,
      daily_water_ml = excluded.daily_water_ml,
      updated_at = CURRENT_TIMESTAMP
  `);

  stmt.run({
    login_id: req.loginId,
    name: name.trim(),
    age: Math.round(num(age)),
    height_cm: Math.round(num(heightCm)),
    current_weight_kg: num(currentWeightKg),
    goal_weight_kg: Number.isFinite(num(goalWeightKg)) ? num(goalWeightKg) : null,
    activity_level: activityLevel,
    deficit_kcal: targets.deficit_kcal,
    daily_calorie_target: targets.daily_calorie_target,
    daily_protein_g: targets.daily_protein_g,
    daily_carb_g: targets.daily_carb_g,
    daily_fat_g: targets.daily_fat_g,
    daily_water_ml: targets.daily_water_ml,
  });

  db.prepare('INSERT INTO weight_log (login_id, weight_kg) VALUES (?, ?)').run(
    req.loginId,
    num(currentWeightKg)
  );

  const profile = db.prepare('SELECT * FROM user_profile WHERE login_id = ?').get(req.loginId);
  res.json({
    profile,
    targets,
    tdee: calcTDEE({
      weightKg: num(currentWeightKg),
      heightCm: num(heightCm),
      age: num(age),
      activityLevel,
    }),
  });
});

export default router;
