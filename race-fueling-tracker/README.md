# Race Fueling Tracker

A local-only, mobile-first web app for a small group of endurance athletes (triathlon, trail 20K, half marathon). Use it to manage profiles, set personalised carbohydrate targets and carb-loading plans, keep a daily food diary, and plan and track race-day fueling.

- React 18 + Vite, plain JavaScript and CSS. No runtime dependencies beyond React.
- All data lives in your browser's `localStorage` (versioned schema). There is no server, no cloud service, and no API keys.
- Works offline once `npm install` has run.

## Run

```bash
cd race-fueling-tracker
npm install
npm run dev
```

Open http://localhost:5173/

Other scripts: `npm test` (unit tests for calculations and data integrity), `npm run build`.

## Features

- **Dashboard**: athlete count, upcoming races with countdowns, and for the selected athlete today's target, consumed, remaining, % achieved and prep phase. Also a comparison table for the whole team.
- **Athletes**: add, edit and delete profiles. Five illustrative *Sample* athletes are seeded. Weight changes are recorded with a date, so earlier days keep their original targets.
- **Carb Loading**: target (g/day) = weight (kg) × g/kg/day. Includes guidance ranges (3–5, 5–7, 8–12) and a phase selector (Normal, D-7…D-4, D-3, D-2, D-1, Race day, Recovery). The D-7 → D+2 calendar shows target, actual and remaining for each day. Suggestions scale with expected race duration, so short races don't get an aggressive carb load. Every value can be overridden.
- **Food Diary**: meal groups, add/edit/delete with live totals (carbs, protein, fat, kcal, fluid, sodium), date navigation, and copying meals from another day. Also an optional hydration log measured against your own targets.
- **Race Day**: planned carbs = g/h × duration. Generates an editable timeline with clock times, and each item can be marked Planned, Consumed, Skipped or Replaced. Shows actual g/h, cumulative and hour-by-hour plan vs actual.
  - Triathlon: Swim, T1, Bike, T2 and Run segments. No fueling is scheduled in the swim or transitions, and bike and run have separate products and intervals.
  - Trail and half marathon: schedule by time interval or by aid/water stations (km). Trail plans also take elevation gain and aid-station notes.
- **Food Database**: ten generic foods with estimated values. Add, edit, delete and search, with optional proportional scaling when the serving size changes, and "Add to meal log".
- **Data**: export and import JSON (validated before anything is replaced), export food logs as CSV, and reset to demo data.

## Notes

Nutrition values and suggestions are general estimates and guidance, not medical advice. Use rates the athlete has practised in training.
