// Shared user data injected into every 1:1 agent chat so the fleet shares one log.

import db from '../db/database.js';

function todayMeals(loginId) {
  return db
    .prepare(
      `SELECT meal_type, food_name, calories, protein_g, carbs_g, fat_g, source, logged_at
       FROM meals WHERE login_id = ? AND date(logged_at) = date('now','localtime')
       ORDER BY logged_at`
    )
    .all(loginId);
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

function recentFleetLines(loginId, limit = 8) {
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

/** Text block appended to each agent's system prompt. */
export function buildFleetContext(loginId) {
  const profile = db.prepare('SELECT * FROM user_profile WHERE login_id = ?').get(loginId);
  const meals = todayMeals(loginId);
  const totals = todayTotals(meals);
  const water = db
    .prepare(
      `SELECT COALESCE(SUM(amount_ml),0) AS ml FROM water_log
       WHERE login_id = ? AND date(logged_at) = date('now','localtime')`
    )
    .get(loginId);
  const workout = db
    .prepare(
      `SELECT workout_type, workout_name, duration_min, intensity, completed_at FROM workouts
       WHERE login_id = ? AND date(completed_at) = date('now','localtime')
       ORDER BY completed_at DESC LIMIT 1`
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

  const lines = [
    '=== SHARED TEJAS LOG (all agents share this — including meals logged via Anna, photo, or quick log) ===',
    'Never tell the user you cannot access another agent\'s data. You all read the same database.',
  ];

  if (profile) {
    lines.push(
      `User: ${profile.name}, ${profile.age}y, ${profile.current_weight_kg}kg → goal ${profile.goal_weight_kg ?? '—'}kg`,
      `Targets today: ${profile.daily_calorie_target} kcal, ${profile.daily_protein_g}g protein, ${profile.daily_water_ml}ml water`
    );
  } else {
    lines.push('User: profile not set up yet.');
  }

  lines.push(`\nTODAY'S MEALS (${meals.length} logged):`);
  if (meals.length === 0) {
    lines.push('(none yet)');
  } else {
    meals.forEach((m) => {
      lines.push(
        `- ${m.meal_type}: ${m.food_name} — ${m.calories} kcal, P${m.protein_g}g C${m.carbs_g}g F${m.fat_g}g (via ${m.source})`
      );
    });
    lines.push(
      `Running totals: ${Math.round(totals.calories)} kcal, ${Math.round(totals.protein_g)}g protein, ${Math.round(totals.carbs_g)}g carbs, ${Math.round(totals.fat_g)}g fat`
    );
  }

  lines.push(`Water today: ${water?.ml ?? 0} ml`);
  if (workout) {
    lines.push(
      `Workout today: ${workout.workout_name || workout.workout_type} (${workout.duration_min ?? '?'} min, ${workout.intensity || '—'})`
    );
  } else {
    lines.push('Workout today: none logged');
  }
  if (sleep) {
    lines.push(`Last sleep: ${sleep.duration_hours ?? '?'}h, quality ${sleep.quality ?? '—'}/10`);
  }
  if (lastWeight) {
    lines.push(`Latest weight: ${lastWeight.weight_kg} kg`);
  }

  const fleet = recentFleetLines(loginId);
  if (fleet.length) {
    lines.push('\nRECENT FLEET GROUP CHAT (agents talking to each other):');
    fleet.forEach((m) => {
      if (m.role === 'system') lines.push(`[event] ${m.content}`);
      else lines.push(`[${m.agent_name || 'agent'}] ${m.content}`);
    });
  }

  lines.push('=== END SHARED LOG ===');
  return lines.join('\n');
}
