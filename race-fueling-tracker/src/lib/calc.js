// Carbohydrate calculation engine. Pure functions only.
import { daysBetween, parseDuration } from './dates.js';

export const WEIGHT_MIN = 25;
export const WEIGHT_MAX = 250;

export const CARB_RANGES = [
  { key: 'light', label: 'Normal / lighter training', min: 3, max: 5 },
  { key: 'moderate', label: 'Moderate–high endurance training', min: 5, max: 7 },
  { key: 'loading', label: 'Carb loading (prolonged events)', min: 8, max: 12 },
];

export const PHASES = [
  { key: 'normal', label: 'Normal training' },
  { key: 'taper', label: 'D-7 to D-4' },
  { key: 'd3', label: 'D-3' },
  { key: 'd2', label: 'D-2' },
  { key: 'd1', label: 'D-1' },
  { key: 'race', label: 'Race day' },
  { key: 'recovery', label: 'Recovery' },
];

export const phaseLabel = (key) => PHASES.find((p) => p.key === key)?.label ?? 'Normal training';

export function isValidWeight(w) {
  const n = Number(w);
  return w !== '' && w != null && Number.isFinite(n) && n >= WEIGHT_MIN && n <= WEIGHT_MAX;
}

export function isValidGPerKg(g) {
  const n = Number(g);
  return g !== '' && g != null && Number.isFinite(n) && n >= 0 && n <= 20;
}

/** Daily carbohydrate target (g/day) = weight (kg) × target (g/kg/day). Null if inputs are invalid. */
export function dailyCarbTarget(weightKg, gPerKg) {
  if (!isValidWeight(weightKg) || !isValidGPerKg(gPerKg)) return null;
  return Math.round(Number(weightKg) * Number(gPerKg) * 10) / 10;
}

/** Planned race carbohydrate (g) = target (g/h) × duration (h). Null if invalid. */
export function plannedRaceCarbs(gPerHour, durationHours) {
  const g = Number(gPerHour);
  const h = Number(durationHours);
  if (!Number.isFinite(g) || g < 0 || !Number.isFinite(h) || h <= 0) return null;
  return Math.round(g * h * 10) / 10;
}

export function progress(target, consumed) {
  const c = Number(consumed) || 0;
  if (target == null || !(target > 0)) {
    return { target: null, consumed: c, remaining: null, pct: null };
  }
  return {
    target,
    consumed: c,
    remaining: Math.round((target - c) * 10) / 10,
    pct: Math.round((c / target) * 100),
  };
}

/** Race-preparation phase for a calendar date given a race date. */
export function phaseForDate(raceDate, date) {
  if (!raceDate || !date) return 'normal';
  const d = daysBetween(date, raceDate); // days until race
  if (d > 7) return 'normal';
  if (d >= 4) return 'taper';
  if (d === 3) return 'd3';
  if (d === 2) return 'd2';
  if (d === 1) return 'd1';
  if (d === 0) return 'race';
  if (d >= -2) return 'recovery';
  return 'normal';
}

export function raceDurationMinutes(athlete) {
  return parseDuration(athlete?.expectedFinish);
}

/**
 * Suggested starting g/kg/day for a phase. Scaled to expected race duration so
 * short races don't get an aggressive carb load. Guidance only — always editable.
 */
export function suggestedGPerKg(phase, durationMin, baseGPerKg) {
  const base = isValidGPerKg(baseGPerKg) ? Number(baseGPerKg) : 5;
  const h = (durationMin ?? 0) / 60;
  const long = h >= 2.5; // prolonged event: full carb load reasonable
  const mid = h >= 1.5 && !long;
  switch (phase) {
    case 'd3': return long ? Math.max(base, 8) : mid ? Math.max(base, 6) : base;
    case 'd2': return long ? Math.max(base, 9) : mid ? Math.max(base, 7) : base;
    case 'd1': return long ? Math.max(base, 10) : mid ? Math.max(base, 8) : Math.max(base, 6);
    case 'race': return long ? Math.max(base, 8) : Math.max(base, 6);
    case 'recovery': return Math.max(base, long ? 6 : 5);
    case 'taper':
    case 'normal':
    default: return base;
  }
}

export function loadingStrategyNote(durationMin) {
  const h = (durationMin ?? 0) / 60;
  if (!durationMin) return 'Enter an expected finish time to tailor the plan.';
  if (h >= 2.5) return 'Prolonged event (≥ 2.5 h): a 2–3 day carb load (≈8–12 g/kg/day) is a reasonable starting point.';
  if (h >= 1.5) return 'Mid-length event (1.5–2.5 h): a moderate increase over D-2/D-1 is usually enough; a full load is optional.';
  return 'Short event (< 1.5 h): a full carb load is generally unnecessary — focus on a carbohydrate-rich D-1 and pre-race meal.';
}

/** Weight (kg) in effect on a given date, using the athlete's weight history. */
export function weightOnDate(athlete, date) {
  const hist = Array.isArray(athlete?.weightHistory) ? athlete.weightHistory : [];
  if (hist.length === 0) return athlete?.weightKg ?? null;
  const sorted = [...hist].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  let w = sorted[0].kg;
  for (const h of sorted) {
    if (h.date <= date) w = h.kg;
    else break;
  }
  return w;
}

/** Resolve the carbohydrate target for an athlete on a date. */
export function dayTarget(data, athlete, date) {
  const plan = data.dayPlans?.[athlete.id]?.[date];
  const autoPhase = phaseForDate(athlete.raceDate, date);
  const phase = plan?.phase ?? autoPhase;
  const duration = raceDurationMinutes(athlete);
  const suggested = suggestedGPerKg(phase, duration, athlete.dailyCarbGPerKg);
  const custom = plan && isValidGPerKg(plan.gPerKg);
  const gPerKg = custom ? Number(plan.gPerKg) : suggested;
  const weightKg = weightOnDate(athlete, date);
  return {
    date,
    phase,
    autoPhase,
    gPerKg,
    suggested,
    source: custom ? 'custom' : 'suggested',
    weightKg,
    weightValid: isValidWeight(weightKg),
    targetG: dailyCarbTarget(weightKg, gPerKg),
  };
}

export const NUTRIENTS = ['carbs', 'protein', 'fat', 'kcal', 'sodiumMg', 'fluidMl'];

const round1 = (n) => Math.round(n * 10) / 10;

/** Scale a food's per-serving values to a given amount (same unit as servingSize). */
export function scaleNutrients(base, amount) {
  const size = Number(base?.servingSize);
  const amt = Number(amount);
  const out = {};
  const factor = size > 0 && Number.isFinite(amt) && amt >= 0 ? amt / size : 0;
  for (const k of NUTRIENTS) {
    const v = Number(base?.[k]);
    out[k] = Number.isFinite(v) ? round1(v * factor) : 0;
  }
  return out;
}

export function sumEntries(entries) {
  const t = Object.fromEntries(NUTRIENTS.map((k) => [k, 0]));
  for (const e of entries) for (const k of NUTRIENTS) t[k] += Number(e[k]) || 0;
  for (const k of NUTRIENTS) t[k] = round1(t[k]);
  return t;
}

export function entriesFor(data, athleteId, date) {
  return (data.diary ?? []).filter((e) => e.athleteId === athleteId && e.date === date);
}

export function hydrationFor(data, athleteId, date) {
  return (data.hydration ?? []).filter((h) => h.athleteId === athleteId && h.date === date);
}
