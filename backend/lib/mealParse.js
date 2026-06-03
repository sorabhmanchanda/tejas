import { callAI, parseJsonResponse, hasApiKey } from './ai.js';

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

function clampNum(value, { min = 0, max = 10000, fallback = 0 } = {}) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

export function fallbackMealParse(text) {
  const t = text.trim().slice(0, 120);
  return {
    food_name: t,
    calories: 350,
    protein_g: 14,
    carbs_g: 45,
    fat_g: 10,
    fiber_g: 6,
    confidence: 0.35,
  };
}

export function normalizeMealParse(parsed, text) {
  const fb = fallbackMealParse(text);
  return {
    food_name: String(parsed?.food_name || text).trim().slice(0, 120) || fb.food_name,
    calories: Math.round(clampNum(parsed?.calories, { min: 0, max: 10000, fallback: fb.calories })),
    protein_g: clampNum(parsed?.protein_g, { min: 0, max: 1000, fallback: fb.protein_g }),
    carbs_g: clampNum(parsed?.carbs_g, { min: 0, max: 2000, fallback: fb.carbs_g }),
    fat_g: clampNum(parsed?.fat_g, { min: 0, max: 1000, fallback: fb.fat_g }),
    fiber_g: clampNum(parsed?.fiber_g, { min: 0, max: 500, fallback: fb.fiber_g }),
    confidence: clampNum(parsed?.confidence, { min: 0, max: 1, fallback: fb.confidence }),
  };
}

/** Parse free-text / voice meal. Always returns usable macros (Gemini or fallback). */
export async function parseMealDescription(text, meal_type = 'snack') {
  const trimmed = text.trim();
  if (!trimmed) throw new Error('text is required');

  if (!hasApiKey()) {
    return { parsed: normalizeMealParse(fallbackMealParse(trimmed), trimmed), mock: true };
  }

  try {
    const out = await callAI({
      maxTokens: 800,
      json: true,
      system: PARSE_SYSTEM,
      messages: [{ role: 'user', content: `Meal type: ${meal_type}\nDescription: ${trimmed}` }],
    });
    return { parsed: normalizeMealParse(parseJsonResponse(out), trimmed) };
  } catch (e) {
    console.error('[meal/parse]', e.message);
    return {
      parsed: normalizeMealParse(fallbackMealParse(trimmed), trimmed),
      degraded: true,
      mock: true,
      note: 'Used a rough estimate because Gemini could not parse right now. You can edit after logging.',
    };
  }
}
