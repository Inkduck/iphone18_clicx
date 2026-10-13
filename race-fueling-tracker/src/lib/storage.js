// Versioned localStorage persistence, normalisation and import validation.
import { seedData } from './seed.js';
import { isValidISODate } from './dates.js';
import { uid } from './ids.js';
import { createRacePlan } from './fueling.js';

export const STORAGE_KEY = 'race-fueling-tracker';
export const SCHEMA_VERSION = 1;

const isObj = (v) => v != null && typeof v === 'object' && !Array.isArray(v);
const num = (v, d = '') => (v === '' || v == null || !Number.isFinite(Number(v)) ? d : Number(v));
const str = (v, d = '') => (typeof v === 'string' ? v : v == null ? d : String(v));

function normAthlete(a) {
  const weightKg = num(a.weightKg);
  const hist = Array.isArray(a.weightHistory)
    ? a.weightHistory.filter((h) => isObj(h) && isValidISODate(h.date) && (h.kg === null || Number.isFinite(Number(h.kg))))
        .map((h) => ({ date: h.date, kg: h.kg === null ? null : Number(h.kg) }))
    : [];
  if (hist.length === 0 && weightKg !== '') hist.push({ date: '2000-01-01', kg: weightKg });
  return {
    id: str(a.id) || uid(),
    isSample: !!a.isSample,
    name: str(a.name, 'Athlete'),
    sex: str(a.sex, ''),
    age: num(a.age),
    heightCm: num(a.heightCm),
    weightKg,
    weightHistory: hist,
    sport: str(a.sport),
    raceType: str(a.raceType, 'half_marathon'),
    raceDistanceKm: num(a.raceDistanceKm),
    raceDate: isValidISODate(a.raceDate) ? a.raceDate : '',
    raceStartTime: str(a.raceStartTime, '07:00'),
    expectedFinish: str(a.expectedFinish),
    elevationGainM: num(a.elevationGainM),
    dailyCarbGPerKg: num(a.dailyCarbGPerKg, 5),
    raceCarbGPerHour: num(a.raceCarbGPerHour, 60),
    notes: str(a.notes),
  };
}

function normFood(f) {
  return {
    id: str(f.id) || uid(),
    name: str(f.name, 'Food'),
    category: str(f.category, 'Other'),
    servingSize: num(f.servingSize, 100),
    servingUnit: str(f.servingUnit, 'g'),
    carbs: num(f.carbs, 0),
    protein: num(f.protein, 0),
    fat: num(f.fat, 0),
    kcal: num(f.kcal, 0),
    sodiumMg: num(f.sodiumMg),
    fluidMl: num(f.fluidMl),
    isEstimate: !!f.isEstimate,
  };
}

function normEntry(e) {
  return {
    id: str(e.id) || uid(),
    athleteId: str(e.athleteId),
    date: e.date,
    meal: str(e.meal, 'other'),
    foodId: str(e.foodId),
    foodName: str(e.foodName, 'Food'),
    amount: num(e.amount, 0),
    unit: str(e.unit, 'g'),
    base: isObj(e.base) ? e.base : null,
    carbs: num(e.carbs, 0),
    protein: num(e.protein, 0),
    fat: num(e.fat, 0),
    kcal: num(e.kcal, 0),
    sodiumMg: num(e.sodiumMg, 0),
    fluidMl: num(e.fluidMl, 0),
    time: str(e.time),
    notes: str(e.notes),
  };
}

function normHydration(h) {
  return {
    id: str(h.id) || uid(),
    athleteId: str(h.athleteId),
    date: h.date,
    time: str(h.time),
    waterMl: num(h.waterMl, 0),
    sportsDrinkMl: num(h.sportsDrinkMl, 0),
    sodiumMg: num(h.sodiumMg),
    notes: str(h.notes),
  };
}

/** Fill in missing fields safely and drop orphaned / malformed records. */
export function normalizeData(raw) {
  const athletes = (raw.athletes ?? []).filter(isObj).map(normAthlete);
  const ids = new Set(athletes.map((a) => a.id));
  const racePlans = {};
  for (const a of athletes) {
    const p = raw.racePlans?.[a.id];
    racePlans[a.id] = isObj(p) && Array.isArray(p.segments) && Array.isArray(p.events)
      ? { ...createRacePlan(a), ...p, athleteId: a.id }
      : createRacePlan(a);
  }
  const dayPlans = {};
  for (const [aid, days] of Object.entries(isObj(raw.dayPlans) ? raw.dayPlans : {})) {
    if (!ids.has(aid) || !isObj(days)) continue;
    dayPlans[aid] = {};
    for (const [d, p] of Object.entries(days)) {
      if (isValidISODate(d) && isObj(p)) dayPlans[aid][d] = { id: str(p.id) || uid(), phase: p.phase == null || p.phase === '' ? null : str(p.phase), gPerKg: num(p.gPerKg) };
    }
  }
  const hydrationTargets = {};
  for (const [aid, t] of Object.entries(isObj(raw.hydrationTargets) ? raw.hydrationTargets : {})) {
    if (ids.has(aid) && isObj(t)) hydrationTargets[aid] = { fluidMl: num(t.fluidMl), sodiumMg: num(t.sodiumMg), note: str(t.note) };
  }
  const prefs = isObj(raw.preferences) ? raw.preferences : {};
  return {
    version: SCHEMA_VERSION,
    athletes,
    foods: (raw.foods ?? []).filter(isObj).map(normFood),
    diary: (raw.diary ?? []).filter((e) => isObj(e) && ids.has(e.athleteId) && isValidISODate(e.date)).map(normEntry),
    hydration: (raw.hydration ?? []).filter((h) => isObj(h) && ids.has(h.athleteId) && isValidISODate(h.date)).map(normHydration),
    dayPlans,
    racePlans,
    hydrationTargets,
    preferences: {
      selectedAthleteId: ids.has(prefs.selectedAthleteId) ? prefs.selectedAthleteId : athletes[0]?.id ?? null,
      page: str(prefs.page, 'dashboard'),
    },
  };
}

/** Migrate older schema versions forward. Only v1 exists today. */
export function migrate(raw) {
  const v = Number(raw.version) || 1;
  if (v > SCHEMA_VERSION) throw new Error(`Data was saved by a newer version (v${v}).`);
  return raw;
}

/** Strict validation for imported files. Returns a list of problems (empty = OK). */
export function validateImport(raw) {
  const errors = [];
  if (!isObj(raw)) return ['File is not a JSON object.'];
  if (raw.app !== undefined && raw.app !== 'race-fueling-tracker') errors.push('File was not exported from Race Fueling Tracker.');
  if (!Number.isInteger(Number(raw.version)) || Number(raw.version) < 1) errors.push('Missing or invalid "version".');
  else if (Number(raw.version) > SCHEMA_VERSION) errors.push(`Unsupported version ${raw.version}.`);
  if (!Array.isArray(raw.athletes)) errors.push('"athletes" must be an array.');
  if (!Array.isArray(raw.foods)) errors.push('"foods" must be an array.');
  for (const k of ['diary', 'hydration']) if (raw[k] !== undefined && !Array.isArray(raw[k])) errors.push(`"${k}" must be an array.`);
  if (errors.length) return errors;

  const ids = new Set();
  raw.athletes.forEach((a, i) => {
    if (!isObj(a) || typeof a.id !== 'string' || !a.id) errors.push(`Athlete #${i + 1} has no id.`);
    else if (ids.has(a.id)) errors.push(`Duplicate athlete id "${a.id}".`);
    else ids.add(a.id);
    if (isObj(a) && typeof a.name !== 'string') errors.push(`Athlete #${i + 1} has no name.`);
  });
  raw.foods.forEach((f, i) => {
    if (!isObj(f) || typeof f.name !== 'string' || !Number.isFinite(Number(f.carbs))) errors.push(`Food #${i + 1} is missing a name or carbohydrate value.`);
  });
  (raw.diary ?? []).forEach((e, i) => {
    if (!isObj(e) || !ids.has(e.athleteId) || !isValidISODate(e.date)) errors.push(`Diary entry #${i + 1} has an unknown athlete or invalid date.`);
  });
  return errors.slice(0, 20);
}

export function loadData(storage = globalThis.localStorage) {
  try {
    const text = storage?.getItem(STORAGE_KEY);
    if (!text) return seedData();
    const parsed = migrate(JSON.parse(text));
    const data = normalizeData(parsed);
    return data;
  } catch (err) {
    console.error('Could not load saved data; keeping a backup and starting fresh.', err);
    try { storage?.setItem(`${STORAGE_KEY}-corrupt-backup`, storage.getItem(STORAGE_KEY)); } catch { /* ignore */ }
    return seedData();
  }
}

export function saveData(data, storage = globalThis.localStorage) {
  storage?.setItem(STORAGE_KEY, JSON.stringify(data));
}

export function exportJSON(data) {
  return JSON.stringify({ app: 'race-fueling-tracker', exportedAt: new Date().toISOString(), ...data }, null, 2);
}

/** Parse + validate + normalise an import. Throws with a readable message; never touches current data. */
export function parseImport(text) {
  let raw;
  try { raw = JSON.parse(text); } catch { throw new Error('File is not valid JSON.'); }
  const errors = validateImport(raw);
  if (errors.length) throw new Error(errors.join('\n'));
  const { app, exportedAt, ...rest } = raw;
  return normalizeData(migrate(rest));
}
