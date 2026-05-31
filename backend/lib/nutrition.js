// =============================================
// Nutrition math + safety guardrails (build guide section 7)
// Shared shape mirrored in frontend/src/lib/tdee.js
// =============================================

export const ACTIVITY_MULTIPLIERS = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9,
};

// Section 7 guardrails.
export const SAFETY = {
  CALORIE_FLOOR: 1500, // hard floor on calorie target
  MAX_DEFICIT: 500, // deficit cap at default
  MIN_DEFICIT: 200,
  PROTEIN_MIN_PER_KG: 1.2, // protein minimum g/kg
  PROTEIN_TARGET_PER_KG: 1.8, // high for cut + lifting
  FAT_PCT_OF_CALORIES: 0.25,
  WATER_ML_PER_KG: 35,
  WEIGHT_LOSS_RATE_FLAG_PCT: 0.01, // >1% bodyweight/week is flagged
};

// Mifflin-St Jeor BMR. Male-leaning constant (+5); for a single-user tool we
// expose `sex` but default to the guide's male profile.
export function mifflinStJeor({ weightKg, heightCm, age, sex = 'male' }) {
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age;
  return Math.round(base + (sex === 'female' ? -161 : 5));
}

export function calcTDEE({ weightKg, heightCm, age, activityLevel, sex = 'male' }) {
  const bmr = mifflinStJeor({ weightKg, heightCm, age, sex });
  const multiplier = ACTIVITY_MULTIPLIERS[activityLevel] ?? ACTIVITY_MULTIPLIERS.moderate;
  return Math.round(bmr * multiplier);
}

/**
 * Compute calorie + macro + water targets for a cut, applying section 7 guardrails.
 * Returns the computed targets plus an array of `warnings` so the UI can surface
 * any guardrail that clamped a value (no silent security/safety tradeoffs).
 */
export function computeTargets({
  weightKg,
  heightCm,
  age,
  activityLevel,
  sex = 'male',
  deficitKcal = 400,
  override = false,
}) {
  const warnings = [];
  const tdee = calcTDEE({ weightKg, heightCm, age, activityLevel, sex });

  // Clamp deficit to the allowed band.
  let deficit = Math.round(deficitKcal);
  if (deficit > SAFETY.MAX_DEFICIT) {
    warnings.push(`Deficit capped at ${SAFETY.MAX_DEFICIT} kcal (requested ${deficit}).`);
    deficit = SAFETY.MAX_DEFICIT;
  }
  if (deficit < SAFETY.MIN_DEFICIT && deficit > 0) {
    deficit = Math.max(deficit, SAFETY.MIN_DEFICIT);
  }

  let calorieTarget = tdee - deficit;

  // Hard floor unless explicitly overridden.
  if (calorieTarget < SAFETY.CALORIE_FLOOR) {
    if (override) {
      warnings.push(
        `Calorie target ${calorieTarget} is below the ${SAFETY.CALORIE_FLOOR} kcal floor — override accepted, monitor closely.`
      );
    } else {
      warnings.push(
        `Calorie target raised to the ${SAFETY.CALORIE_FLOOR} kcal floor (computed ${calorieTarget}). Enable override to go lower.`
      );
      calorieTarget = SAFETY.CALORIE_FLOOR;
    }
  }

  // Protein: target 1.8 g/kg, never below 1.2 g/kg minimum.
  const proteinTarget = Math.round(SAFETY.PROTEIN_TARGET_PER_KG * weightKg);
  const proteinMin = Math.round(SAFETY.PROTEIN_MIN_PER_KG * weightKg);
  const proteinG = Math.max(proteinTarget, proteinMin);

  // Fat: 25% of calories (9 kcal/g).
  const fatG = Math.round((calorieTarget * SAFETY.FAT_PCT_OF_CALORIES) / 9);

  // Carbs: remainder (4 kcal/g), floored at 0.
  const proteinKcal = proteinG * 4;
  const fatKcal = fatG * 9;
  const carbG = Math.max(0, Math.round((calorieTarget - proteinKcal - fatKcal) / 4));

  const waterMl = Math.round(SAFETY.WATER_ML_PER_KG * weightKg);

  return {
    tdee,
    deficit_kcal: deficit,
    daily_calorie_target: calorieTarget,
    daily_protein_g: proteinG,
    daily_protein_min_g: proteinMin,
    daily_carb_g: carbG,
    daily_fat_g: fatG,
    daily_water_ml: waterMl,
    warnings,
  };
}

/**
 * Flag an unsafe weekly weight-loss rate (>1% bodyweight/week).
 */
export function weightLossRateFlag({ startWeightKg, endWeightKg, days = 7 }) {
  if (!startWeightKg || !endWeightKg || days <= 0) return null;
  const lost = startWeightKg - endWeightKg;
  const weeklyRate = (lost / days) * 7;
  const pct = (weeklyRate / startWeightKg) * 100;
  if (pct > SAFETY.WEIGHT_LOSS_RATE_FLAG_PCT * 100) {
    return {
      severity: 'high',
      title: 'Weight dropping faster than 1%/week',
      body: `You're down ~${weeklyRate.toFixed(2)} kg/week (${pct.toFixed(
        1
      )}% of bodyweight). That's faster than the safe ceiling — consider easing the deficit to protect muscle and energy. This is a suggestion, not a rule.`,
    };
  }
  return null;
}
