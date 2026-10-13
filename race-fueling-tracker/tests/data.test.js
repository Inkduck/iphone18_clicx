import { describe, it, expect } from 'vitest';
import { seedData } from '../src/lib/seed.js';
import * as ops from '../src/lib/ops.js';
import { entriesFor, sumEntries, dayTarget } from '../src/lib/calc.js';
import { exportJSON, parseImport, loadData, saveData, STORAGE_KEY } from '../src/lib/storage.js';
import { raceMetrics, generateEvents, segmentAt, createRacePlan } from '../src/lib/fueling.js';
import { foodLogCSV } from '../src/lib/csv.js';

const TODAY = '2026-10-13';
const memStorage = () => {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
};

function setup() {
  let data = seedData(TODAY);
  const [a1, a2] = data.athletes;
  const rice = data.foods.find((f) => f.name.startsWith('Cooked white rice'));
  const gel = data.foods.find((f) => f.name.startsWith('Sports gel'));
  return { data, a1, a2, rice, gel };
}

describe('seed', () => {
  it('has 5 clearly labelled sample athletes with unique ids', () => {
    const { data } = setup();
    expect(data.athletes).toHaveLength(5);
    expect(new Set(data.athletes.map((a) => a.id)).size).toBe(5);
    expect(data.athletes.every((a) => a.isSample && a.name.startsWith('Sample'))).toBe(true);
    expect(data.foods).toHaveLength(10);
  });
});

describe('food diary integrity', () => {
  it('adding, editing and deleting entries updates totals', () => {
    let { data, a1, rice, gel } = setup();
    const e1 = ops.makeEntry(rice, { athleteId: a1.id, date: TODAY, meal: 'lunch', amount: 300 });
    data = ops.addEntry(data, e1);
    expect(sumEntries(entriesFor(data, a1.id, TODAY)).carbs).toBe(84);

    data = ops.addEntry(data, ops.makeEntry(gel, { athleteId: a1.id, date: TODAY, meal: 'other', amount: 2 }));
    expect(sumEntries(entriesFor(data, a1.id, TODAY)).carbs).toBe(134);

    data = ops.updateEntry(data, e1.id, { amount: 150 });
    expect(sumEntries(entriesFor(data, a1.id, TODAY)).carbs).toBe(92);

    data = ops.deleteEntry(data, e1.id);
    expect(sumEntries(entriesFor(data, a1.id, TODAY)).carbs).toBe(50);
  });

  it('athletes and dates do not mix', () => {
    let { data, a1, a2, rice } = setup();
    data = ops.addEntry(data, ops.makeEntry(rice, { athleteId: a1.id, date: TODAY, meal: 'lunch', amount: 150 }));
    data = ops.addEntry(data, ops.makeEntry(rice, { athleteId: a2.id, date: '2026-10-12', meal: 'dinner', amount: 450 }));
    expect(sumEntries(entriesFor(data, a1.id, TODAY)).carbs).toBe(42);
    expect(sumEntries(entriesFor(data, a2.id, TODAY)).carbs).toBe(0);
    expect(sumEntries(entriesFor(data, a2.id, '2026-10-12')).carbs).toBe(126);
    expect(sumEntries(entriesFor(data, a1.id, '2026-10-12')).carbs).toBe(0);
  });

  it('copies a previous day', () => {
    let { data, a1, rice } = setup();
    data = ops.addEntry(data, ops.makeEntry(rice, { athleteId: a1.id, date: '2026-10-12', meal: 'lunch', amount: 150 }));
    const r = ops.copyEntries(data, a1.id, '2026-10-12', TODAY);
    expect(r.count).toBe(1);
    expect(sumEntries(entriesFor(r.data, a1.id, TODAY)).carbs).toBe(42);
    expect(entriesFor(r.data, a1.id, TODAY)[0].id).not.toBe(entriesFor(r.data, a1.id, '2026-10-12')[0].id);
  });

  it('weight change keeps history and past targets', () => {
    let { data, a1, rice } = setup();
    const yesterday = '2026-10-12';
    data = ops.addEntry(data, ops.makeEntry(rice, { athleteId: a1.id, date: yesterday, meal: 'lunch', amount: 150 }));
    const before = JSON.stringify(data.diary);
    const pastTarget = dayTarget(data, a1, yesterday).targetG;
    data = ops.updateAthlete(data, a1.id, { weightKg: 60 }, TODAY);
    const a1b = data.athletes.find((a) => a.id === a1.id);
    expect(JSON.stringify(data.diary)).toBe(before);
    expect(dayTarget(data, a1b, yesterday).targetG).toBe(pastTarget);
    const t = dayTarget(data, a1b, TODAY);
    expect(t.targetG).toBe(60 * t.gPerKg);
  });

  it('deleting a food keeps diary snapshots', () => {
    let { data, a1, rice } = setup();
    data = ops.addEntry(data, ops.makeEntry(rice, { athleteId: a1.id, date: TODAY, meal: 'lunch', amount: 150 }));
    data = ops.deleteFood(data, rice.id);
    expect(sumEntries(entriesFor(data, a1.id, TODAY)).carbs).toBe(42);
  });

  it('day plan overrides suggestion per athlete', () => {
    let { data, a1, a2 } = setup();
    data = ops.setDayPlan(data, a1.id, TODAY, { phase: 'd1', gPerKg: 8 });
    expect(dayTarget(data, a1, TODAY).targetG).toBe(576);
    expect(dayTarget(data, a2, TODAY).source).toBe('suggested');
  });
});

describe('persistence', () => {
  it('saves and reloads (refresh) without loss', () => {
    let { data, a1, rice } = setup();
    data = ops.addEntry(data, ops.makeEntry(rice, { athleteId: a1.id, date: TODAY, meal: 'lunch', amount: 150 }));
    const s = memStorage();
    saveData(data, s);
    expect(loadData(s)).toEqual(data);
  });

  it('corrupt storage falls back to seed and keeps a backup', () => {
    const s = memStorage();
    s.setItem(STORAGE_KEY, '{not json');
    expect(loadData(s).athletes).toHaveLength(5);
    expect(s.getItem(`${STORAGE_KEY}-corrupt-backup`)).toBe('{not json');
  });

  it('export → import round trip preserves records', () => {
    let { data, a1, rice } = setup();
    data = ops.addEntry(data, ops.makeEntry(rice, { athleteId: a1.id, date: TODAY, meal: 'lunch', amount: 150, notes: 'a, "quoted"' }));
    data = ops.setDayPlan(data, a1.id, TODAY, { phase: 'd2', gPerKg: 9 });
    expect(parseImport(exportJSON(data))).toEqual(data);
  });

  it('rejects invalid imports with readable errors', () => {
    expect(() => parseImport('nope')).toThrow(/valid JSON/);
    expect(() => parseImport('[]')).toThrow(/object/);
    expect(() => parseImport(JSON.stringify({ version: 1, athletes: 'x', foods: [] }))).toThrow(/athletes/);
    expect(() => parseImport(JSON.stringify({ version: 1, athletes: [{ id: 'a', name: 'A' }, { id: 'a', name: 'B' }], foods: [] }))).toThrow(/Duplicate/);
    expect(() => parseImport(JSON.stringify({ version: 1, athletes: [], foods: [], diary: [{ athleteId: 'zz', date: TODAY }] }))).toThrow(/unknown athlete/);
    expect(() => parseImport(JSON.stringify({ version: 99, athletes: [], foods: [] }))).toThrow(/Unsupported/);
  });

  it('fills missing fields safely', () => {
    const d = parseImport(JSON.stringify({ version: 1, athletes: [{ id: 'a', name: 'A' }], foods: [{ name: 'X', carbs: 5 }] }));
    expect(d.athletes[0].dailyCarbGPerKg).toBe(5);
    expect(d.racePlans.a).toBeTruthy();
    expect(d.foods[0].id).toBeTruthy();
  });

  it('CSV escapes commas and quotes', () => {
    let { data, a1, rice } = setup();
    data = ops.addEntry(data, ops.makeEntry(rice, { athleteId: a1.id, date: TODAY, meal: 'lunch', amount: 150, notes: 'a, "b"' }));
    const csv = foodLogCSV(data);
    expect(csv.split('\n')).toHaveLength(2);
    expect(csv).toContain('"a, ""b"""');
  });
});

describe('race fueling', () => {
  it('triathlon never schedules fuel during swim or transitions', () => {
    const { data } = setup();
    const a = data.athletes.find((x) => x.raceType === 'tri_703');
    const plan = data.racePlans[a.id];
    expect(plan.segments.map((s) => s.type)).toEqual(['swim', 't1', 'bike', 't2', 'run']);
    expect(plan.events.length).toBeGreaterThan(0);
    for (const e of plan.events) expect(['bike', 'run']).toContain(segmentAt(plan, e.elapsedMin).type);
    expect(raceMetrics(plan).swimConflicts).toHaveLength(0);
  });

  it('target = g/h × duration and actual tracks consumed / replaced', () => {
    const athlete = { id: 'x', raceType: 'half_marathon', raceDistanceKm: 21.1, expectedFinish: '3:00', raceCarbGPerHour: 60, weightKg: 60 };
    const plan = createRacePlan(athlete);
    let m = raceMetrics(plan);
    expect(m.target).toBe(180);
    expect(m.actual).toBe(0);
    plan.events[0].status = 'consumed';
    plan.events[1].status = 'skipped';
    plan.events[2].status = 'replaced';
    plan.events[2].replacementCarbs = 15;
    m = raceMetrics(plan);
    expect(m.actual).toBe(25 + 15);
    expect(m.lastLogged).toBe(plan.events[2].elapsedMin);
    expect(m.actualPerHour).toBeCloseTo(40 / (plan.events[2].elapsedMin / 60));
    // Skipping does not cause later events to be enlarged (no catch-up dosing).
    expect(plan.events.slice(3).every((e) => e.servings === 1)).toBe(true);
  });

  it('no feeds in the last 10 minutes; station strategy uses km', () => {
    const athlete = { id: 'x', raceType: 'half_marathon', raceDistanceKm: 21.1, expectedFinish: '2:00', raceCarbGPerHour: 45, weightKg: 60 };
    const plan = createRacePlan(athlete);
    expect(plan.events.every((e) => e.elapsedMin <= 110)).toBe(true);
    const st = generateEvents({ ...plan, strategy: 'stations', stationsKm: '5, 10, 15, 18' }, athlete);
    expect(st.length).toBeGreaterThan(0);
    expect(st.every((e) => e.note.startsWith('Station'))).toBe(true);
  });

  it('zero target or missing duration produces no events', () => {
    expect(createRacePlan({ id: 'x', raceType: 'trail_20k', expectedFinish: '', raceCarbGPerHour: 60 }).events).toHaveLength(0);
    expect(createRacePlan({ id: 'x', raceType: 'trail_20k', expectedFinish: '2:00', raceCarbGPerHour: 0 }).events).toHaveLength(0);
  });
});

describe('clearing weight', () => {
  it('blank weight gives no target from today but keeps past targets', () => {
    let data = seedData(TODAY);
    const a = data.athletes[0];
    const past = dayTarget(data, a, '2026-10-12').targetG;
    data = ops.updateAthlete(data, a.id, { weightKg: '' }, TODAY);
    const b = data.athletes[0];
    expect(dayTarget(data, b, TODAY).targetG).toBeNull();
    expect(dayTarget(data, b, '2026-10-12').targetG).toBe(past);
    const s = memStorage();
    saveData(data, s);
    expect(dayTarget(loadData(s), loadData(s).athletes[0], TODAY).targetG).toBeNull();
  });
});

describe('partial athlete updates', () => {
  it('updating race fields keeps weight and syncs the race plan', () => {
    let data = seedData(TODAY);
    const a = data.athletes[3];
    data = ops.updateAthlete(data, a.id, { raceCarbGPerHour: 60, raceStartTime: '06:00', expectedFinish: '3:00' }, TODAY);
    const b = data.athletes[3];
    expect(b.weightKg).toBe(55);
    expect(b.weightHistory).toEqual(a.weightHistory);
    expect(data.racePlans[a.id].carbGPerHour).toBe(60);
    expect(data.racePlans[a.id].startTime).toBe('06:00');
    expect(raceMetrics(data.racePlans[a.id]).target).toBe(180);
  });
});
