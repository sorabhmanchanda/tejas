// Shared user data — every agent reads the same Tejas database (meals, workouts, etc.).

import db from '../db/database.js';

const DENIAL_RE =
  /do not have access|don't have access|cannot access|can't access|other agent|external system|operate solely|provide.*directly to me/i;

export function isStaleDenialMessage(content) {
  return DENIAL_RE.test(String(content ?? ''));
}

function todayMeals(loginId) {
  return db
    .prepare(
      `SELECT meal_type, food_name, calories, protein_g, carbs_g, fat_g, source, logged_at
       FROM meals WHERE login_id = ? AND date(logged_at) = date('now','localtime')
       ORDER BY logged_at`
    )
    .all(loginId);
}

function todayWorkouts(loginId) {
  return db
    .prepare(
      `SELECT workout_type, workout_name, duration_min, calories_burned, intensity, rpe, completed_at
       FROM workouts WHERE login_id = ? AND date(completed_at) = date('now','localtime')
       ORDER BY completed_at`
    )
    .all(loginId);
}

function estimateBurn(workout) {
  if (workout.calories_burned > 0) return workout.calories_burned;
  const min = workout.duration_min || 30;
  const mult = { low: 4, moderate: 6, high: 8 }[workout.intensity] || 6;
  return Math.round(min * mult);
}

function todayTotals(meals) {
  return meals.reduce(
    (acc, m) => ({
      calories: acc.calories + m.calories,
      protein_g: acc.protein_g + m.protein_g,
      carbs_g: acc.carbs_g + m.carbs_g,
      fat_g: acc.fat_g + m.fat_g,
    }),
    { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 }
  );
}

function recentFleetLines(loginId, limit = 6) {
  const rows = db
    .prepare(
      `SELECT f.role, f.content, a.name AS agent_name
       FROM fleet_messages f
       LEFT JOIN agents a ON a.id = f.agent_id
       WHERE f.login_id = ?
       ORDER BY f.created_at DESC LIMIT ?`
    )
    .all(loginId, limit);
  return rows.reverse();
}

/** Live shared log text for all agents. */
export function buildFleetContext(loginId) {
  const profile = db.prepare('SELECT * FROM user_profile WHERE login_id = ?').get(loginId);
  const meals = todayMeals(loginId);
  const workouts = todayWorkouts(loginId);
  const totals = todayTotals(meals);
  const water = db
    .prepare(
      `SELECT COALESCE(SUM(amount_ml),0) AS ml FROM water_log
       WHERE login_id = ? AND date(logged_at) = date('now','localtime')`
    )
    .get(loginId);
  const sleep = db
    .prepare(
      'SELECT duration_hours, quality FROM sleep_log WHERE login_id = ? ORDER BY created_at DESC LIMIT 1'
    )
    .get(loginId);
  const lastWeight = db
    .prepare('SELECT weight_kg, logged_at FROM weight_log WHERE login_id = ? ORDER BY logged_at DESC LIMIT 1')
    .get(loginId);

  let burnTotal = 0;
  workouts.forEach((w) => {
    burnTotal += estimateBurn(w);
  });

  const targetKcal = profile?.daily_calorie_target ?? 0;
  const netKcal = Math.round(totals.calories - burnTotal);
  const remaining = targetKcal ? targetKcal - netKcal : null;

  const lines = [
    '=== TEJAS SHARED DATABASE (live — same for Anna, Agni, Bala, Nidra, Sage) ===',
    'Meals logged via Anna, photo analyze, or quick log are ALL in MEALS below.',
    'Workouts logged via Bala or quick log are ALL in WORKOUTS below.',
    'FORBIDDEN: Never say you lack access to another agent. You share one database.',
    'When asked about food or workouts, quote the entries below with numbers.',
  ];

  if (profile) {
    lines.push(
      `\nUSER: ${profile.name}, ${profile.age}y, ${profile.current_weight_kg}kg → goal ${profile.goal_weight_kg ?? '—'}kg`,
      `DAILY TARGETS: ${profile.daily_calorie_target} kcal intake, ${profile.daily_protein_g}g protein, ${profile.daily_water_ml}ml water`
    );
  }

  lines.push(`\n--- MEALS TODAY (${meals.length}) [logged through Anna / photo / app] ---`);
  if (meals.length === 0) {
    lines.push('(none)');
  } else {
    meals.forEach((m) => {
      lines.push(
        `• ${m.meal_type}: ${m.food_name} — ${m.calories} kcal | P${m.protein_g}g C${m.carbs_g}g F${m.fat_g}g (${m.source})`
      );
    });
    lines.push(
      `MEAL TOTALS: ${Math.round(totals.calories)} kcal, ${Math.round(totals.protein_g)}g protein`
    );
  }

  lines.push(`\n--- WORKOUTS TODAY (${workouts.length}) [logged through Bala / app] ---`);
  if (workouts.length === 0) {
    lines.push('(none)');
  } else {
    workouts.forEach((w) => {
      const burn = estimateBurn(w);
      lines.push(
        `• ${w.workout_name || w.workout_type}: ${w.duration_min ?? '?'} min, ${w.intensity || 'moderate'} — ~${burn} kcal burned${w.calories_burned ? ' (logged)' : ' (estimated)'}`
      );
    });
    lines.push(`WORKOUT BURN TOTAL: ~${burnTotal} kcal`);
  }

  lines.push(`\n--- ENERGY BALANCE TODAY ---`);
  lines.push(`Intake: ${Math.round(totals.calories)} kcal | Burned: ~${burnTotal} kcal | Net: ~${netKcal} kcal`);
  if (remaining != null) {
    lines.push(`Vs ${targetKcal} kcal target: ${remaining >= 0 ? `${remaining} kcal still available` : `${Math.abs(remaining)} kcal over target`}`);
  }

  lines.push(`Water: ${water?.ml ?? 0} ml`);
  if (sleep) lines.push(`Last sleep: ${sleep.duration_hours ?? '?'}h (quality ${sleep.quality ?? '—'}/10)`);
  if (lastWeight) lines.push(`Latest weight: ${lastWeight.weight_kg} kg`);

  const fleet = recentFleetLines(loginId);
  if (fleet.length) {
    lines.push('\n--- RECENT FLEET CHAT ---');
    fleet.forEach((m) => {
      if (m.role === 'system') lines.push(`[event] ${m.content}`);
      else lines.push(`[${m.agent_name}] ${m.content}`);
    });
  }

  lines.push('=== END SHARED DATABASE ===');
  return lines.join('\n');
}

/** Prime the model + attach history (stale denials stripped). */
export function buildAgentChatMessages(history, fleetContext) {
  const cleaned = history.filter((m) => !isStaleDenialMessage(m.content));

  return [
    {
      role: 'user',
      content: `System data refresh:\n${fleetContext}`,
    },
    {
      role: 'assistant',
      content:
        'I have the live shared Tejas log. I can see all meals (including via Anna/photo) and all workouts (including via Bala), with kcal and macros. I will use these numbers in my replies.',
    },
    ...cleaned.map((m) => ({ role: m.role, content: m.content })),
  ];
}
