// =============================================
// Sage — morning briefing. Pulls yesterday's data + pending findings.
// =============================================

import { Router } from 'express';
import db from '../db/database.js';
import { callAI, hasApiKey } from '../lib/ai.js';
import { requireLoginId } from '../lib/user.js';

const router = Router();
router.use(requireLoginId);

function getProfile(loginId) {
  return db.prepare('SELECT * FROM user_profile WHERE login_id = ?').get(loginId);
}

function getYesterday(loginId) {
  const meals = db
    .prepare(
      `SELECT * FROM meals WHERE login_id = ? AND date(logged_at) = date('now','-1 day','localtime')`
    )
    .all(loginId);
  const totals = meals.reduce(
    (acc, m) => ({
      calories: acc.calories + m.calories,
      protein_g: acc.protein_g + m.protein_g,
    }),
    { calories: 0, protein_g: 0 }
  );
  const water = db
    .prepare(
      `SELECT COALESCE(SUM(amount_ml),0) AS ml FROM water_log
       WHERE login_id = ? AND date(logged_at) = date('now','-1 day','localtime')`
    )
    .get(loginId).ml;
  const workout = db
    .prepare(
      `SELECT * FROM workouts WHERE login_id = ? AND date(completed_at) = date('now','-1 day','localtime') LIMIT 1`
    )
    .get(loginId);
  const sleep = db
    .prepare('SELECT * FROM sleep_log WHERE login_id = ? ORDER BY created_at DESC LIMIT 1')
    .get(loginId);
  return {
    calories: totals.calories,
    protein_g: Math.round(totals.protein_g),
    water_ml: water,
    workout_summary: workout?.workout_name ?? null,
    sleep_hours: sleep?.duration_hours ?? null,
    sleep_quality: sleep?.quality ?? null,
  };
}

async function generateMorningBriefing(profile, yesterdayData, todayPlan, findings) {
  const findingsList = findings
    .map((f) => `[${f.agent_id.toUpperCase()} | ${f.severity}] ${f.title}: ${f.body}`)
    .join('\n');

  return callAI({
    maxTokens: 1000,
    system: `You are Sage, the chief coach for ${profile.name}'s health agent fleet.
${profile.name} is on a fat-loss cut. They are eggetarian, train at the gym + run.

You write the morning briefing — short, energizing, actionable. No fluff.
Format:
1. Top line — one sentence on yesterday (good or bad, be honest)
2. Today's mission — calorie target, key workout, one focus
3. Watchouts — anything specific to be careful about today

Tone: trusted coach. Direct. Calm. Not preachy. Not over-positive.`,
    messages: [
      {
        role: 'user',
        content: `PROFILE: ${profile.name}, ${profile.age}y, ${profile.current_weight_kg}kg, goal ${profile.goal_weight_kg}kg
TARGETS: ${profile.daily_calorie_target} kcal, ${profile.daily_protein_g}g protein

YESTERDAY:
- Calories: ${yesterdayData.calories} / ${profile.daily_calorie_target}
- Protein: ${yesterdayData.protein_g}g / ${profile.daily_protein_g}g
- Water: ${yesterdayData.water_ml}ml / ${profile.daily_water_ml}ml
- Workout: ${yesterdayData.workout_summary || 'none'}
- Sleep: ${yesterdayData.sleep_hours}h, quality ${yesterdayData.sleep_quality}/10

TODAY'S PLAN:
- Workout: ${todayPlan.workout_name}
- Calorie target: ${profile.daily_calorie_target} kcal

PENDING FINDINGS FROM AGENTS:
${findingsList || 'none'}

Write today's briefing.`,
      },
    ],
  });
}

function ensureSeedFindings(loginId, profile) {
  const count = db
    .prepare('SELECT COUNT(*) AS c FROM findings WHERE login_id = ?')
    .get(loginId).c;
  if (count > 0 || !profile) return;
  const seed = [
    {
      agent_id: 'agni',
      title: 'Protein tends to lag on gym days',
      body: `On training days your protein has been landing under ${profile.daily_protein_g}g. Front-load eggs or paneer at breakfast to close the gap. Suggestion, not a rule.`,
      severity: 'medium',
    },
    {
      agent_id: 'bala',
      title: "Today is Push day",
      body: 'Bench, overhead press, dips. Keep it under 60 min. Aim to add 2.5kg on your top bench set if last week felt smooth.',
      severity: 'low',
    },
    {
      agent_id: 'nidra',
      title: 'Hydration started slow yesterday',
      body: 'You hit water targets late in the day. A glass on waking sets the tone — small nudge, big compounding effect.',
      severity: 'low',
    },
  ];
  const stmt = db.prepare(
    'INSERT INTO findings (login_id, agent_id, title, body, severity) VALUES (@login_id, @agent_id, @title, @body, @severity)'
  );
  seed.forEach((f) => stmt.run({ login_id: loginId, ...f }));
}

router.get('/latest', (req, res) => {
  const briefing = db
    .prepare(
      `SELECT * FROM briefings WHERE login_id = ? AND briefing_type='morning'
       AND date(created_at)=date('now','localtime') ORDER BY created_at DESC LIMIT 1`
    )
    .get(req.loginId);
  res.json({ briefing: briefing ?? null });
});

router.post('/morning', async (req, res) => {
  const profile = getProfile(req.loginId);
  if (!profile) return res.status(400).json({ error: 'Complete onboarding first' });

  ensureSeedFindings(req.loginId, profile);

  const findings = db
    .prepare(
      "SELECT * FROM findings WHERE login_id = ? AND status = 'pending' ORDER BY created_at DESC"
    )
    .all(req.loginId);
  const yesterday = getYesterday(req.loginId);
  const todayPlan = { workout_name: req.body?.workout_name || 'Push Day — 45 min' };

  let content;
  if (hasApiKey()) {
    try {
      content = await generateMorningBriefing(profile, yesterday, todayPlan, findings);
    } catch (e) {
      console.error('[briefing]', e.message);
    }
  }
  if (!content) {
    content = `Good morning, ${profile.name}. Yesterday was steady — keep the momentum.

Today's mission: stay under ${profile.daily_calorie_target} kcal and hit ${profile.daily_protein_g}g protein. Key session: ${todayPlan.workout_name}. One focus: protein at breakfast.

Watchouts: start water early, and don't skip the first set warmups.

(Offline draft — set GEMINI_API_KEY for Sage's live briefing.)`;
  }

  const findingIds = JSON.stringify(findings.map((f) => f.id));
  const info = db
    .prepare(
      "INSERT INTO briefings (login_id, briefing_type, content, finding_ids) VALUES (?, 'morning', ?, ?)"
    )
    .run(req.loginId, content, findingIds);

  res.json({
    briefing: db.prepare('SELECT * FROM briefings WHERE id = ?').get(info.lastInsertRowid),
    findings,
  });
});

export default router;
