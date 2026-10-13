import { raceTypeLabel } from './fueling.js';

const esc = (v) => {
  const s = v == null ? '' : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function foodLogCSV(data) {
  const byId = Object.fromEntries(data.athletes.map((a) => [a.id, a]));
  const header = ['date', 'athlete', 'race_type', 'meal', 'time', 'food', 'amount', 'unit',
    'carbs_g', 'protein_g', 'fat_g', 'kcal', 'sodium_mg', 'fluid_ml', 'notes'];
  const rows = [...data.diary]
    .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))
    .map((e) => {
      const a = byId[e.athleteId];
      return [e.date, a?.name, raceTypeLabel(a?.raceType), e.meal, e.time, e.foodName, e.amount, e.unit,
        e.carbs, e.protein, e.fat, e.kcal, e.sodiumMg, e.fluidMl, e.notes];
    });
  return [header, ...rows].map((r) => r.map(esc).join(',')).join('\n');
}
