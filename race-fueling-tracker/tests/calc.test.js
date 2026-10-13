import { describe, it, expect } from 'vitest';
import {
  dailyCarbTarget, plannedRaceCarbs, progress, phaseForDate, suggestedGPerKg,
  scaleNutrients, sumEntries, dayTarget, weightOnDate,
} from '../src/lib/calc.js';
import { parseDuration, addDays, daysBetween, clockPlus } from '../src/lib/dates.js';

describe('daily carbohydrate target', () => {
  it('Case A: 60 kg × 8 g/kg = 480 g', () => expect(dailyCarbTarget(60, 8)).toBe(480));
  it('Case B: 72 kg × 6 g/kg = 432 g', () => expect(dailyCarbTarget(72, 6)).toBe(432));
  it('Case C: 55 kg × 5 g/kg = 275 g', () => expect(dailyCarbTarget(55, 5)).toBe(275));
  it('accepts numeric strings from form inputs', () => expect(dailyCarbTarget('60', '8')).toBe(480));

  it.each([[''], [null], [undefined], [0], [-60], ['abc'], [NaN], [10], [400]])(
    'returns null for invalid weight %p', (w) => expect(dailyCarbTarget(w, 8)).toBeNull());
  it('returns null for invalid g/kg', () => {
    expect(dailyCarbTarget(60, '')).toBeNull();
    expect(dailyCarbTarget(60, -1)).toBeNull();
    expect(dailyCarbTarget(60, 50)).toBeNull();
  });
});

describe('race carbohydrate', () => {
  it('Case D: 3 h × 60 g/h = 180 g', () => expect(plannedRaceCarbs(60, 3)).toBe(180));
  it('uses parsed finish time', () => expect(plannedRaceCarbs(60, parseDuration('3:00') / 60)).toBe(180));
  it('rejects zero/invalid duration', () => {
    expect(plannedRaceCarbs(60, 0)).toBeNull();
    expect(plannedRaceCarbs(60, NaN)).toBeNull();
  });
});

describe('progress', () => {
  it('computes remaining and percentage', () => {
    expect(progress(480, 120)).toEqual({ target: 480, consumed: 120, remaining: 360, pct: 25 });
  });
  it('no misleading values when target is missing', () => {
    expect(progress(null, 120)).toEqual({ target: null, consumed: 120, remaining: null, pct: null });
  });
});

describe('dates & phases', () => {
  const race = '2026-10-20';
  it('parses durations', () => {
    expect(parseDuration('2:05')).toBe(125);
    expect(parseDuration('1:30:30')).toBe(90.5);
    expect(parseDuration('abc')).toBeNull();
    expect(parseDuration('0:00')).toBeNull();
  });
  it('clock arithmetic wraps midnight', () => {
    expect(clockPlus('07:00', 95)).toBe('08:35');
    expect(clockPlus('23:30', 45)).toBe('00:15');
  });
  it('day arithmetic across month boundary', () => {
    expect(addDays('2026-10-30', 3)).toBe('2026-11-02');
    expect(daysBetween('2026-10-13', race)).toBe(7);
  });
  it('maps dates to phases', () => {
    expect(phaseForDate(race, addDays(race, -10))).toBe('normal');
    expect(phaseForDate(race, addDays(race, -7))).toBe('taper');
    expect(phaseForDate(race, addDays(race, -4))).toBe('taper');
    expect(phaseForDate(race, addDays(race, -3))).toBe('d3');
    expect(phaseForDate(race, addDays(race, -2))).toBe('d2');
    expect(phaseForDate(race, addDays(race, -1))).toBe('d1');
    expect(phaseForDate(race, race)).toBe('race');
    expect(phaseForDate(race, addDays(race, 1))).toBe('recovery');
    expect(phaseForDate(race, addDays(race, 3))).toBe('normal');
  });
  it('does not prescribe aggressive loading for short races', () => {
    expect(suggestedGPerKg('d1', 80, 5)).toBe(6);
    expect(suggestedGPerKg('d3', 80, 5)).toBe(5);
    expect(suggestedGPerKg('d1', 345, 6)).toBe(10);
  });
});

describe('food scaling', () => {
  const rice = { servingSize: 150, carbs: 42, protein: 4, fat: 0.4, kcal: 195, sodiumMg: 2, fluidMl: '' };
  it('scales proportionally', () => {
    const s = scaleNutrients(rice, 300);
    expect(s.carbs).toBe(84);
    expect(s.kcal).toBe(390);
    expect(s.fluidMl).toBe(0);
  });
  it('sums entries', () => {
    expect(sumEntries([{ carbs: 10.25, kcal: 5 }, { carbs: 20, kcal: 5 }]).carbs).toBe(30.3);
  });
});

describe('weight history', () => {
  const a = { id: 'x', weightKg: 70, dailyCarbGPerKg: 6, raceDate: '2027-01-01', expectedFinish: '2:00',
    weightHistory: [{ date: '2000-01-01', kg: 72 }, { date: '2026-10-13', kg: 70 }] };
  it('uses the weight in effect on each date', () => {
    expect(weightOnDate(a, '2026-10-12')).toBe(72);
    expect(weightOnDate(a, '2026-10-13')).toBe(70);
  });
  it('target for a past date uses the past weight', () => {
    const data = { dayPlans: {} };
    expect(dayTarget(data, a, '2026-10-12').targetG).toBe(432);
    expect(dayTarget(data, a, '2026-10-13').targetG).toBe(420);
  });
  it('invalid weight yields no target', () => {
    const b = { ...a, weightKg: '', weightHistory: [] };
    const t = dayTarget({ dayPlans: {} }, b, '2026-10-13');
    expect(t.weightValid).toBe(false);
    expect(t.targetG).toBeNull();
  });
});
