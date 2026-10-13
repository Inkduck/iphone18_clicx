// Race-day fueling planner engine. Pure functions only.
import { uid } from './ids.js';
import { plannedRaceCarbs } from './calc.js';
import { parseDuration } from './dates.js';

export const RACE_TYPES = [
  { key: 'tri_sprint', label: 'Triathlon Sprint', sport: 'Triathlon', distanceKm: 25.75 },
  { key: 'tri_olympic', label: 'Triathlon Olympic Distance', sport: 'Triathlon', distanceKm: 51.5 },
  { key: 'tri_703', label: 'Triathlon 70.3', sport: 'Triathlon', distanceKm: 113 },
  { key: 'tri_full', label: 'Triathlon Full Distance', sport: 'Triathlon', distanceKm: 226 },
  { key: 'trail_20k', label: 'Trail Running 20K', sport: 'Trail running', distanceKm: 20 },
  { key: 'half_marathon', label: 'Half Marathon', sport: 'Road running', distanceKm: 21.1 },
];

export const raceTypeLabel = (key) => RACE_TYPES.find((r) => r.key === key)?.label ?? key ?? '—';
export const isTriathlon = (key) => typeof key === 'string' && key.startsWith('tri_');

export const STATUSES = ['planned', 'consumed', 'skipped', 'replaced'];

// Typical share of total race time per segment (illustrative starting split; editable).
const TRI_SPLITS = {
  tri_sprint: [0.16, 0.03, 0.5, 0.02, 0.29],
  tri_olympic: [0.17, 0.02, 0.5, 0.01, 0.3],
  tri_703: [0.1, 0.02, 0.5, 0.01, 0.37],
  tri_full: [0.1, 0.01, 0.5, 0.01, 0.38],
};

const TRI_SEGMENTS = [
  { type: 'swim', name: 'Swim' },
  { type: 't1', name: 'T1' },
  { type: 'bike', name: 'Bike' },
  { type: 't2', name: 'T2' },
  { type: 'run', name: 'Run' },
];

export const canFuelSegment = (type) => type === 'bike' || type === 'run';

export const DEFAULT_PRODUCT = { name: 'Sports gel (generic)', carbs: 25, fluidMl: 0, sodiumMg: 50 };

export function suggestInterval(gPerHour, carbsPerServing) {
  const g = Number(gPerHour);
  const c = Number(carbsPerServing);
  if (!(g > 0) || !(c > 0)) return 30;
  const raw = (60 * c) / g;
  return Math.min(60, Math.max(10, Math.round(raw / 5) * 5));
}

export function defaultSegments(raceType, totalMin, gPerHour) {
  const interval = suggestInterval(gPerHour, DEFAULT_PRODUCT.carbs);
  const mk = (s, durationMin) => ({
    id: uid(),
    type: s.type,
    name: s.name,
    durationMin,
    fuel: canFuelSegment(s.type),
    product: { ...DEFAULT_PRODUCT },
    intervalMin: interval,
    firstAtMin: Math.min(interval, 20),
  });
  if (isTriathlon(raceType)) {
    const split = TRI_SPLITS[raceType];
    const total = totalMin || 0;
    const mins = split.map((p) => Math.round(total * p));
    mins[4] += total - mins.reduce((a, b) => a + b, 0); // absorb rounding in the run
    return TRI_SEGMENTS.map((s, i) => mk(s, mins[i]));
  }
  return [mk({ type: 'run', name: raceType === 'trail_20k' ? 'Trail run' : 'Run' }, Math.round(totalMin || 0))];
}

export function createRacePlan(athlete) {
  const total = parseDuration(athlete.expectedFinish) ?? 0;
  const gph = Number(athlete.raceCarbGPerHour) || 0;
  const weight = Number(athlete.weightKg);
  const plan = {
    id: uid(),
    athleteId: athlete.id,
    raceType: athlete.raceType,
    builtForFinish: athlete.expectedFinish || '',
    startTime: athlete.raceStartTime || '07:00',
    carbGPerHour: gph,
    preRaceMealCarbs: weight > 0 ? Math.round(weight * 2) : '',
    preRaceMealHoursBefore: 3,
    preRaceMealDone: false,
    strategy: 'interval', // 'interval' | 'stations' (run-only races)
    stationsKm: athlete.raceType === 'half_marathon' ? '5, 10, 15, 18' : athlete.raceType === 'trail_20k' ? '7, 14' : '',
    aidNotes: '',
    segments: defaultSegments(athlete.raceType, total, gph),
    events: [],
  };
  plan.events = generateEvents(plan, athlete);
  return plan;
}

export function segmentBounds(segments) {
  let t = 0;
  return segments.map((s) => {
    const start = t;
    t += Number(s.durationMin) || 0;
    return { ...s, start, end: t };
  });
}

export function planDuration(plan) {
  return (plan?.segments ?? []).reduce((a, s) => a + (Number(s.durationMin) || 0), 0);
}

export function segmentAt(plan, elapsedMin) {
  const b = segmentBounds(plan.segments ?? []);
  return b.find((s) => elapsedMin >= s.start && elapsedMin < s.end) ?? b[b.length - 1] ?? null;
}

function eventFor(seg, elapsedMin) {
  return {
    id: uid(),
    elapsedMin: Math.round(elapsedMin),
    segmentId: seg.id,
    product: seg.product?.name || 'Product',
    servings: 1,
    carbsPerServing: Number(seg.product?.carbs) || 0,
    fluidMl: Number(seg.product?.fluidMl) || 0,
    sodiumMg: Number(seg.product?.sodiumMg) || 0,
    status: 'planned',
    replacement: '',
    replacementCarbs: '',
    note: '',
  };
}

/**
 * Generate a fueling timeline. Swim and transitions are never scheduled.
 * No feeds in the last 10 minutes of the race (they can't be absorbed in time).
 */
export function generateEvents(plan, athlete) {
  const total = planDuration(plan);
  const events = [];
  if (!(Number(plan.carbGPerHour) > 0) || total <= 0) return events;
  const runOnly = !isTriathlon(athlete?.raceType);
  const cutoff = total - 10;

  for (const seg of segmentBounds(plan.segments)) {
    if (!seg.fuel || !canFuelSegment(seg.type)) continue;
    const interval = Math.max(5, Number(seg.intervalMin) || 30);
    const segEnd = Math.min(seg.end - 3, cutoff);

    if (runOnly && plan.strategy === 'stations' && athlete?.raceDistanceKm > 0) {
      // Fuel at aid/water stations; skip a station if the last feed was too recent.
      const kms = parseKmList(plan.stationsKm).filter((k) => k < athlete.raceDistanceKm);
      let last = -Infinity;
      for (const km of kms) {
        const t = seg.start + (km / athlete.raceDistanceKm) * (seg.end - seg.start);
        if (t > segEnd) break;
        if (t - last >= interval * 0.75) {
          const ev = eventFor(seg, t);
          ev.note = `Station @ ${km} km`;
          events.push(ev);
          last = t;
        }
      }
      continue;
    }

    const first = Math.max(5, Number(seg.firstAtMin) || interval);
    for (let t = seg.start + first; t <= segEnd; t += interval) events.push(eventFor(seg, t));
  }
  return events.sort((a, b) => a.elapsedMin - b.elapsedMin);
}

export function parseKmList(str) {
  return String(str ?? '')
    .split(/[,\s]+/)
    .map(Number)
    .filter((n) => Number.isFinite(n) && n > 0)
    .sort((a, b) => a - b);
}

export const plannedCarbs = (ev) => (Number(ev.servings) || 0) * (Number(ev.carbsPerServing) || 0);

export function actualCarbs(ev) {
  if (ev.status === 'consumed') return plannedCarbs(ev);
  if (ev.status === 'replaced') return Number(ev.replacementCarbs) || 0;
  return 0;
}

/** Race metrics: target vs scheduled vs actual, with hour-by-hour breakdown. */
export function raceMetrics(plan) {
  const durationMin = planDuration(plan);
  const hours = durationMin / 60;
  const target = plannedRaceCarbs(plan.carbGPerHour, hours);
  const events = [...(plan.events ?? [])].sort((a, b) => a.elapsedMin - b.elapsedMin);
  const scheduled = events.reduce((a, e) => a + plannedCarbs(e), 0);
  const actual = events.reduce((a, e) => a + actualCarbs(e), 0);
  const logged = events.filter((e) => e.status !== 'planned');
  const lastLogged = logged.length ? logged[logged.length - 1].elapsedMin : 0;
  const plannedToLast = events.filter((e) => e.elapsedMin <= lastLogged && logged.length)
    .reduce((a, e) => a + plannedCarbs(e), 0);
  const actualPerHour = lastLogged > 0 ? actual / (lastLogged / 60) : null;
  const fluid = events.filter((e) => e.status === 'consumed').reduce((a, e) => a + (Number(e.fluidMl) || 0) * (Number(e.servings) || 0), 0);
  const sodium = events.filter((e) => e.status === 'consumed').reduce((a, e) => a + (Number(e.sodiumMg) || 0) * (Number(e.servings) || 0), 0);

  const hourly = [];
  for (let h = 0; h < Math.ceil(hours); h++) {
    const inHour = events.filter((e) => e.elapsedMin >= h * 60 && e.elapsedMin < (h + 1) * 60);
    hourly.push({
      hour: h + 1,
      planned: inHour.reduce((a, e) => a + plannedCarbs(e), 0),
      actual: inHour.reduce((a, e) => a + actualCarbs(e), 0),
    });
  }

  // Cumulative series used in the timeline table.
  let cumPlanned = 0;
  let cumActual = 0;
  const cumulative = events.map((e) => {
    cumPlanned += plannedCarbs(e);
    cumActual += actualCarbs(e);
    return { id: e.id, cumPlanned, cumActual };
  });

  const gph = Number(plan.carbGPerHour) || 0;
  const heavyHours = hourly.filter((h) => h.planned > Math.max(90, gph * 1.25));

  return {
    durationMin, hours, target, scheduled, actual, lastLogged, plannedToLast,
    actualPerHour, fluid, sodium, hourly, cumulative, heavyHours,
    swimConflicts: events.filter((e) => {
      const seg = segmentAt(plan, e.elapsedMin);
      return seg && !canFuelSegment(seg.type);
    }),
  };
}
