// Frontend mirror of backend/lib/nutrition.js for instant onboarding preview.
// The backend remains the source of truth on save.

export const ACTIVITY_MULTIPLIERS = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9,
};

export const ACTIVITY_LABELS = {
  sedentary: 'Sedentary — desk job, little exercise',
  light: 'Light — 1-3 workouts/week',
  moderate: 'Moderate — 3-5 workouts/week',
  active: 'Active — 6-7 workouts/week',
  very_active: 'Very active — hard training/physical job',
};

export const SAFETY = {
  CALORIE_FLOOR: 1500,
  MAX_DEFICIT: 500,
  MIN_DEFICIT: 200,
  PROTEIN_MIN_PER_KG: 1.2,
  PROTEIN_TARGET_PER_KG: 1.8,
  FAT_PCT_OF_CALORIES: 0.25,
  WATER_ML_PER_KG: 35,
};

export function mifflinStJeor({ weightKg, heightCm, age, sex = 'male' }) {
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age;
  return Math.round(base + (sex === 'female' ? -161 : 5));
}

export function calcTDEE({ weightKg, heightCm, age, activityLevel, sex = 'male' }) {
  const bmr = mifflinStJeor({ weightKg, heightCm, age, sex });
  const mult = ACTIVITY_MULTIPLIERS[activityLevel] ?? ACTIVITY_MULTIPLIERS.moderate;
  return Math.round(bmr * mult);
}

export function computeTargets({
  weightKg,
  heightCm,
  age,
  activityLevel,
  deficitKcal = 400,
  override = false,
}) {
  const warnings = [];
  if (![weightKg, heightCm, age].every((n) => Number.isFinite(n) && n > 0)) {
    return null;
  }
  const tdee = calcTDEE({ weightKg, heightCm, age, activityLevel });

  let deficit = Math.round(deficitKcal);
  if (deficit > SAFETY.MAX_DEFICIT) {
    warnings.push(`Deficit capped at ${SAFETY.MAX_DEFICIT} kcal.`);
    deficit = SAFETY.MAX_DEFICIT;
  }

  let calorieTarget = tdee - deficit;
  if (calorieTarget < SAFETY.CALORIE_FLOOR) {
    if (override) {
      warnings.push(`Below ${SAFETY.CALORIE_FLOOR} kcal floor — override on, monitor closely.`);
    } else {
      warnings.push(`Raised to ${SAFETY.CALORIE_FLOOR} kcal floor (computed ${calorieTarget}).`);
      calorieTarget = SAFETY.CALORIE_FLOOR;
    }
  }

  const proteinG = Math.max(
    Math.round(SAFETY.PROTEIN_TARGET_PER_KG * weightKg),
    Math.round(SAFETY.PROTEIN_MIN_PER_KG * weightKg)
  );
  const fatG = Math.round((calorieTarget * SAFETY.FAT_PCT_OF_CALORIES) / 9);
  const carbG = Math.max(0, Math.round((calorieTarget - proteinG * 4 - fatG * 9) / 4));
  const waterMl = Math.round(SAFETY.WATER_ML_PER_KG * weightKg);

  return {
    tdee,
    deficit_kcal: deficit,
    daily_calorie_target: calorieTarget,
    daily_protein_g: proteinG,
    daily_carb_g: carbG,
    daily_fat_g: fatG,
    daily_water_ml: waterMl,
    warnings,
  };
}
