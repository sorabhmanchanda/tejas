import { getFleetSnapshot } from './agentContext.js';
import { parseMealDescription } from './mealParse.js';

const FOOD_REPORT_RE =
  /\b(had|ate|eating|drank|breakfast|lunch|dinner|snack|tea|coffee|sandwich|roti|dal|egg|paneer|meal)\b/i;

function guessMealType() {
  const h = new Date().getHours();
  if (h < 11) return 'breakfast';
  if (h < 16) return 'lunch';
  if (h < 21) return 'dinner';
  return 'snack';
}

function formatMealList(meals) {
  if (!meals.length) return 'No meals logged yet today in the shared Tejas database.';
  return meals
    .map(
      (m) =>
        `• ${m.meal_type}: ${m.food_name} — ${m.calories} kcal (P${m.protein_g}g) [${m.source}]`
    )
    .join('\n');
}

async function agniFallback(snap, userMessage) {
  const lines = [
    '(Gemini is rate-limited right now — answering from your live shared Tejas log.)',
    '',
    '**Meals today (Anna / photo / quick log):**',
    formatMealList(snap.meals),
  ];

  if (snap.meals.length) {
    lines.push(
      '',
      `Running intake: **${Math.round(snap.totals.calories)} kcal**, **${Math.round(snap.totals.protein_g)}g protein**.`
    );
  }

  if (snap.workouts.length) {
    lines.push('', '**Workouts today (Bala / app):**');
    snap.workouts.forEach((w) => {
      lines.push(`• ${w.workout_name || w.workout_type} — ~${w.burn} kcal burned`);
    });
    lines.push(`Burn total: ~${snap.burnTotal} kcal`);
  }

  lines.push(
    '',
    `**Balance:** ~${snap.netKcal} kcal net (intake minus burn).` +
      (snap.remainingKcal != null
        ? ` **${snap.remainingKcal >= 0 ? snap.remainingKcal : Math.abs(snap.remainingKcal)} kcal ${snap.remainingKcal >= 0 ? 'left' : 'over'}** vs ${snap.targetKcal} kcal target.`
        : '')
  );

  if (FOOD_REPORT_RE.test(userMessage)) {
    lines.push('', `You just mentioned: "${userMessage.trim()}"`);
    try {
      const { parsed } = await parseMealDescription(userMessage, guessMealType());
      lines.push(
        `**Estimate (not saved yet):** ~${parsed.calories} kcal, ${parsed.protein_g}g protein, ${parsed.carbs_g}g carbs.`,
        'Use **Quick Log → voice/text** to save it so Anna and I both track it.'
      );
    } catch {
      lines.push('Log it via **Quick Log** so it appears in the shared database.');
    }
  }

  return lines.join('\n');
}

function annaFallback(snap, userMessage) {
  const lines = [
    '(Gemini busy — quick take from your shared log.)',
    formatMealList(snap.meals),
  ];
  if (FOOD_REPORT_RE.test(userMessage)) {
    lines.push(
      '',
      `For "${userMessage.trim()}" — sounds reasonable for eggetarian cut. Log it via voice/photo so Agni can count the kcal.`
    );
  }
  return lines.join('\n');
}

function balaFallback(snap, userMessage) {
  const lines = ['(Gemini busy — from your shared log.)'];
  if (snap.workouts.length) {
    const w = snap.workouts[snap.workouts.length - 1];
    lines.push(`Today's workout: ${w.workout_name || w.workout_type} (${w.duration_min} min).`);
  } else {
    lines.push('No workout logged today yet.');
  }
  if (snap.meals.length) {
    lines.push(`You've eaten ${Math.round(snap.totals.calories)} kcal so far — fuel recovery after training.`);
  }
  lines.push(`You asked: "${userMessage.trim().slice(0, 120)}" — I'll give a full plan when Gemini is back.`);
  return lines.join('\n');
}

function genericFallback(agentId, snap, userMessage) {
  return [
    `(Gemini busy — ${agentId} fallback from shared log.)`,
    formatMealList(snap.meals),
    snap.workouts.length ? `Workout burn today: ~${snap.burnTotal} kcal.` : '',
    `Net kcal today: ~${snap.netKcal}.`,
    `Your message: "${userMessage.trim().slice(0, 150)}"`,
  ]
    .filter(Boolean)
    .join('\n');
}

/** When Gemini fails (429 etc.), still return a useful agent reply. */
export async function buildAgentFallbackReply(agentId, loginId, userMessage) {
  const snap = getFleetSnapshot(loginId);

  switch (agentId) {
    case 'agni':
      return agniFallback(snap, userMessage);
    case 'anna':
      return annaFallback(snap, userMessage);
    case 'bala':
      return balaFallback(snap, userMessage);
    default:
      return genericFallback(agentId, snap, userMessage);
  }
}
