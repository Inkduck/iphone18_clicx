// Illustrative sample data only — not real people. Every value is editable.
import { uid } from './ids.js';
import { addDays, todayISO } from './dates.js';
import { createRacePlan } from './fueling.js';

const food = (name, category, servingSize, servingUnit, carbs, protein, fat, kcal, sodiumMg = '', fluidMl = '') => ({
  id: uid(), name, category, servingSize, servingUnit, carbs, protein, fat, kcal, sodiumMg, fluidMl, isEstimate: true,
});

export function seedFoods() {
  return [
    food('Cooked white rice', 'Grains', 150, 'g', 42, 4, 0.4, 195, 2),
    food('White bread (1 slice)', 'Grains', 30, 'g', 15, 2.7, 1, 80, 150),
    food('Banana (medium)', 'Fruit', 118, 'g', 27, 1.3, 0.4, 105, 1),
    food('Oatmeal (rolled oats, dry)', 'Grains', 40, 'g', 27, 5, 2.8, 150, 2),
    food('Pasta (cooked)', 'Grains', 140, 'g', 43, 8, 1.3, 220, 1),
    food('Sports gel (generic)', 'Sports nutrition', 1, 'sachet', 25, 0, 0, 100, 50),
    food('Sports drink (generic, ~6%)', 'Sports nutrition', 500, 'ml', 30, 0, 0, 120, 250, 500),
    food('Energy bar (generic)', 'Sports nutrition', 60, 'g', 40, 8, 5, 235, 100),
    food('Rice cakes (plain)', 'Snacks', 18, 'g', 14, 1.4, 0.5, 70, 30),
    food('Fruit juice (orange)', 'Drinks', 250, 'ml', 26, 1.7, 0.5, 112, 2, 250),
  ];
}

export function seedAthletes(today = todayISO()) {
  const a = (o) => ({
    id: uid(),
    isSample: true,
    sex: 'Female',
    elevationGainM: '',
    notes: '',
    ...o,
    weightHistory: [{ date: '2000-01-01', kg: o.weightKg }],
  });
  return [
    a({ name: 'Sample 1 — Olympic Triathlete', sex: 'Male', age: 34, heightCm: 178, weightKg: 72,
      sport: 'Triathlon', raceType: 'tri_olympic', raceDistanceKm: 51.5, raceDate: addDays(today, 2),
      raceStartTime: '07:00', expectedFinish: '2:35', dailyCarbGPerKg: 6, raceCarbGPerHour: 60,
      notes: 'Sample profile. Prefers rice-based meals; tolerates gels well on the bike.' }),
    a({ name: 'Sample 2 — 70.3 Triathlete', age: 38, heightCm: 166, weightKg: 62,
      sport: 'Triathlon', raceType: 'tri_703', raceDistanceKm: 113, raceDate: addDays(today, 12),
      raceStartTime: '06:30', expectedFinish: '5:45', dailyCarbGPerKg: 7, raceCarbGPerHour: 75,
      notes: 'Sample profile. Gut-trained to ~75 g/h. Avoids high-fibre food D-2 onward.' }),
    a({ name: 'Sample 3 — Trail 20K Runner', sex: 'Male', age: 27, heightCm: 175, weightKg: 68,
      sport: 'Trail running', raceType: 'trail_20k', raceDistanceKm: 20, raceDate: addDays(today, 20),
      raceStartTime: '06:00', expectedFinish: '2:50', elevationGainM: 900, dailyCarbGPerKg: 6, raceCarbGPerHour: 60,
      notes: 'Sample profile. Prefers chews and bananas; sensitive to very sweet drinks.' }),
    a({ name: 'Sample 4 — Half Marathoner', age: 45, heightCm: 160, weightKg: 55,
      sport: 'Road running', raceType: 'half_marathon', raceDistanceKm: 21.1, raceDate: addDays(today, 33),
      raceStartTime: '05:30', expectedFinish: '2:05', dailyCarbGPerKg: 5, raceCarbGPerHour: 45,
      notes: 'Sample profile. Lactose intolerant. Practising gels at water stations.' }),
    a({ name: 'Sample 5 — Masters Sprint Tri', sex: 'Male', age: 52, heightCm: 182, weightKg: 80,
      sport: 'Triathlon', raceType: 'tri_sprint', raceDistanceKm: 25.75, raceDate: addDays(today, 47),
      raceStartTime: '08:00', expectedFinish: '1:25', dailyCarbGPerKg: 5, raceCarbGPerHour: 30,
      notes: 'Sample profile. Short race — sports drink on the bike only.' }),
  ];
}

export function seedData(today = todayISO()) {
  const athletes = seedAthletes(today);
  const racePlans = {};
  for (const ath of athletes) racePlans[ath.id] = createRacePlan(ath);
  return {
    version: 1,
    athletes,
    foods: seedFoods(),
    diary: [],
    hydration: [],
    dayPlans: {},
    racePlans,
    hydrationTargets: {},
    preferences: { selectedAthleteId: athletes[0].id, page: 'dashboard' },
  };
}
