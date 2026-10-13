// Pure state transitions: (data, ...args) => newData. Used by the UI and tests.
import { uid } from './ids.js';
import { scaleNutrients, isValidWeight } from './calc.js';
import { todayISO, parseDuration } from './dates.js';
import { createRacePlan, generateEvents } from './fueling.js';

export const MAX_ATHLETES_DEFAULT = 5;

export function blankAthlete() {
  return {
    name: '', sex: '', age: '', heightCm: '', weightKg: '', sport: 'Road running',
    raceType: 'half_marathon', raceDistanceKm: 21.1, raceDate: '', raceStartTime: '07:00',
    expectedFinish: '', elevationGainM: '', dailyCarbGPerKg: 5, raceCarbGPerHour: 60, notes: '',
  };
}

export function addAthlete(data, fields, today = todayISO()) {
  const id = uid();
  const kg = isValidWeight(fields.weightKg) ? Number(fields.weightKg) : '';
  const athlete = { ...blankAthlete(), ...fields, id, isSample: false, weightKg: kg,
    weightHistory: kg === '' ? [] : [{ date: today, kg }] };
  return {
    ...data,
    athletes: [...data.athletes, athlete],
    racePlans: { ...data.racePlans, [id]: createRacePlan(athlete) },
    preferences: { ...data.preferences, selectedAthleteId: id },
  };
}

/**
 * Update an athlete. A weight change is recorded in weightHistory effective from
 * `today`, so targets for earlier dates (and all logged food) remain unchanged.
 */
export function updateAthlete(data, id, fields, today = todayISO()) {
  const plan = data.racePlans[id];
  const racePlans = plan
    ? {
        ...data.racePlans,
        [id]: {
          ...plan,
          ...(fields.raceCarbGPerHour !== undefined && { carbGPerHour: Number(fields.raceCarbGPerHour) || 0 }),
          ...(fields.raceStartTime !== undefined && { startTime: fields.raceStartTime }),
          // Single-segment (run) races follow the expected finish time automatically.
          ...(fields.expectedFinish !== undefined && plan.segments?.length === 1 && parseDuration(fields.expectedFinish) && {
            segments: [{ ...plan.segments[0], durationMin: Math.round(parseDuration(fields.expectedFinish)) }],
            builtForFinish: fields.expectedFinish,
          }),
        },
      }
    : data.racePlans;
  return {
    ...data,
    racePlans,
    athletes: data.athletes.map((a) => {
      if (a.id !== id) return a;
      const next = { ...a, ...fields, id, isSample: false };
      if (fields.weightKg === undefined) return next; // partial update (e.g. race fields only)
      const newKg = isValidWeight(fields.weightKg) ? Number(fields.weightKg) : '';
      next.weightKg = newKg;
      // Record weight changes from today onward; a cleared weight is stored as unknown (null).
      const changed = (isValidWeight(newKg) ? Number(newKg) !== Number(a.weightKg) : isValidWeight(a.weightKg));
      if (changed) {
        const hist = (a.weightHistory ?? []).filter((h) => h.date !== today);
        next.weightHistory = [...hist, { date: today, kg: isValidWeight(newKg) ? Number(newKg) : null }];
      }
      return next;
    }),
  };
}

export function deleteAthlete(data, id) {
  const { [id]: _p, ...racePlans } = data.racePlans;
  const { [id]: _d, ...dayPlans } = data.dayPlans;
  const { [id]: _h, ...hydrationTargets } = data.hydrationTargets;
  const athletes = data.athletes.filter((a) => a.id !== id);
  return {
    ...data,
    athletes,
    racePlans,
    dayPlans,
    hydrationTargets,
    diary: data.diary.filter((e) => e.athleteId !== id),
    hydration: data.hydration.filter((h) => h.athleteId !== id),
    preferences: {
      ...data.preferences,
      selectedAthleteId: data.preferences.selectedAthleteId === id ? athletes[0]?.id ?? null : data.preferences.selectedAthleteId,
    },
  };
}

// ---- Day plans (carb targets per date) ----
export function setDayPlan(data, athleteId, date, plan) {
  const days = { ...(data.dayPlans[athleteId] ?? {}) };
  const prev = days[date];
  days[date] = { id: prev?.id ?? uid(), phase: plan.phase ?? prev?.phase ?? 'normal', gPerKg: plan.gPerKg ?? prev?.gPerKg ?? '' };
  return { ...data, dayPlans: { ...data.dayPlans, [athleteId]: days } };
}

export function clearDayPlan(data, athleteId, date) {
  const days = { ...(data.dayPlans[athleteId] ?? {}) };
  delete days[date];
  return { ...data, dayPlans: { ...data.dayPlans, [athleteId]: days } };
}

// ---- Foods ----
export function saveFood(data, food) {
  if (food.id && data.foods.some((f) => f.id === food.id)) {
    return { ...data, foods: data.foods.map((f) => (f.id === food.id ? { ...f, ...food } : f)) };
  }
  return { ...data, foods: [...data.foods, { ...food, id: uid() }] };
}

export function deleteFood(data, id) {
  // Diary entries keep their own nutrient snapshot, so history is unaffected.
  return { ...data, foods: data.foods.filter((f) => f.id !== id) };
}

// ---- Diary ----
export function makeEntry(food, { athleteId, date, meal, amount, time = '', notes = '' }) {
  const base = {
    servingSize: food.servingSize, unit: food.servingUnit, carbs: food.carbs, protein: food.protein,
    fat: food.fat, kcal: food.kcal, sodiumMg: food.sodiumMg, fluidMl: food.fluidMl,
  };
  return {
    id: uid(), athleteId, date, meal, foodId: food.id, foodName: food.name,
    amount: Number(amount), unit: food.servingUnit, base, time, notes,
    ...scaleNutrients(base, amount),
  };
}

export function addEntry(data, entry) {
  return { ...data, diary: [...data.diary, entry] };
}

export function updateEntry(data, id, fields) {
  return {
    ...data,
    diary: data.diary.map((e) => {
      if (e.id !== id) return e;
      const next = { ...e, ...fields };
      if (fields.amount !== undefined && e.base) Object.assign(next, scaleNutrients(e.base, fields.amount));
      return next;
    }),
  };
}

export function deleteEntry(data, id) {
  return { ...data, diary: data.diary.filter((e) => e.id !== id) };
}

/** Copy entries from one date to another for the same athlete (optionally a single meal). */
export function copyEntries(data, athleteId, fromDate, toDate, meal = 'all') {
  const src = data.diary.filter((e) => e.athleteId === athleteId && e.date === fromDate && (meal === 'all' || e.meal === meal));
  const copies = src.map((e) => ({ ...e, id: uid(), date: toDate }));
  return { data: { ...data, diary: [...data.diary, ...copies] }, count: copies.length };
}

// ---- Hydration ----
export function addHydration(data, log) {
  return { ...data, hydration: [...data.hydration, { ...log, id: uid() }] };
}
export function deleteHydration(data, id) {
  return { ...data, hydration: data.hydration.filter((h) => h.id !== id) };
}
export function setHydrationTarget(data, athleteId, target) {
  return { ...data, hydrationTargets: { ...data.hydrationTargets, [athleteId]: target } };
}

// ---- Race plans ----
export function updateRacePlan(data, athleteId, fn) {
  const plan = data.racePlans[athleteId];
  return { ...data, racePlans: { ...data.racePlans, [athleteId]: fn(plan) } };
}

export function regenerateRacePlan(data, athleteId) {
  const athlete = data.athletes.find((a) => a.id === athleteId);
  return updateRacePlan(data, athleteId, (p) => ({ ...p, events: generateEvents(p, athlete) }));
}

export function resetRacePlan(data, athleteId) {
  const athlete = data.athletes.find((a) => a.id === athleteId);
  return { ...data, racePlans: { ...data.racePlans, [athleteId]: createRacePlan(athlete) } };
}
