import React from 'react';
import { Card, Field, TargetSummary, Progress, Badge, fmt } from '../components/ui.jsx';
import {
  CARB_RANGES, PHASES, phaseLabel, dayTarget, entriesFor, sumEntries, progress,
  raceDurationMinutes, loadingStrategyNote, isValidGPerKg,
} from '../lib/calc.js';
import { addDays, formatDate, isValidISODate, formatDuration } from '../lib/dates.js';
import { raceTypeLabel } from '../lib/fueling.js';
import * as ops from '../lib/ops.js';

const CALENDAR = [
  [-7, 'D-7'], [-6, 'D-6'], [-5, 'D-5'], [-4, 'D-4'], [-3, 'D-3'], [-2, 'D-2'], [-1, 'D-1'],
  [0, 'Race day'], [1, 'D+1'], [2, 'D+2'],
];

export default function CarbLoading({ data, update, athlete, today, diaryDate, setDiaryDate, go }) {
  const date = diaryDate;
  const t = dayTarget(data, athlete, date);
  const consumed = sumEntries(entriesFor(data, athlete.id, date)).carbs;
  const p = progress(t.targetG, consumed);
  const duration = raceDurationMinutes(athlete);
  const plan = data.dayPlans[athlete.id]?.[date];

  const setPhase = (phase) => update((d) => ops.setDayPlan(d, athlete.id, date, { phase, gPerKg: '' }));
  const setGPerKg = (v) => update((d) => ops.setDayPlan(d, athlete.id, date, { phase: plan?.phase ?? null, gPerKg: v === '' ? '' : Number(v) }));
  const reset = () => update((d) => ops.clearDayPlan(d, athlete.id, date));

  const gInvalid = plan && plan.gPerKg !== '' && !isValidGPerKg(plan.gPerKg);
  const outside = isValidGPerKg(t.gPerKg) && (t.gPerKg < 3 || t.gPerKg > 12);

  return (
    <div className="page">
      <Card title="Carbohydrate calculator">
        <div className="athlete-headline">
          <div>
            <div className="h-name">{athlete.name}</div>
            <div className="muted small">
              {raceTypeLabel(athlete.raceType)} · race {formatDate(athlete.raceDate)} · expected {formatDuration(duration)}
            </div>
          </div>
        </div>
        <p className="info">{loadingStrategyNote(duration)}</p>

        <div className="form-grid">
          <Field label="Date">
            <input type="date" value={date} onChange={(e) => e.target.value && setDiaryDate(e.target.value)} />
          </Field>
          <Field label="Preparation phase" hint={plan?.phase ? `Set manually · from race date it would be ${phaseLabel(t.autoPhase)}` : 'Follows the race date automatically'}>
            <select value={t.phase} onChange={(e) => setPhase(e.target.value)}>
              {PHASES.map((ph) => <option key={ph.key} value={ph.key}>{ph.label}</option>)}
            </select>
          </Field>
          <Field label="Target (g/kg/day)" error={gInvalid ? 'Enter 0–20 g/kg/day.' : null}
            hint={t.source === 'custom' ? `Custom · suggested ${fmt(t.suggested, 1)}` : 'Suggested — type to customise'}>
            <input type="number" inputMode="decimal" step="0.5" min="0" max="20"
              value={plan?.gPerKg ?? ''} placeholder={String(t.suggested)} onChange={(e) => setGPerKg(e.target.value)} />
          </Field>
          <Field label="Body weight on this date">
            <div className={`readout ${t.weightValid ? '' : 'warn-inline'}`}>{t.weightValid ? `${fmt(t.weightKg, 1)} kg` : 'Missing / invalid'}</div>
          </Field>
        </div>

        <div className="chips">
          <span className="muted small">Starting ranges (guidance, not prescriptions):</span>
          {CARB_RANGES.map((r) => (
            <button key={r.key} className={`chip ${t.gPerKg >= r.min && t.gPerKg <= r.max ? 'chip-on' : ''}`}
              onClick={() => setGPerKg((r.min + r.max) / 2)} title={`Set ${(r.min + r.max) / 2} g/kg/day`}>
              {r.label}: {r.min}–{r.max}
            </button>
          ))}
        </div>

        <div className="formula">
          <span>{t.weightValid ? fmt(t.weightKg, 1) : '?'} kg</span> × <span>{fmt(t.gPerKg, 1)} g/kg/day</span> = <strong>{t.targetG == null ? '—' : `${fmt(t.targetG)} g/day`}</strong>
          <Badge tone={t.source === 'custom' ? 'accent' : 'muted'}>{t.source}</Badge>
        </div>
        {outside && <p className="warn">{fmt(t.gPerKg, 1)} g/kg/day is outside the usual 3–12 g/kg/day guidance. Double-check this is intended.</p>}
        <TargetSummary {...p} invalidReason={!t.weightValid ? 'No target calculated: body weight is missing or invalid. Update it in Athletes.' : null} />
        <div className="row-actions">
          {plan && <button className="btn btn-small" onClick={reset}>Reset to suggested</button>}
          <button className="btn btn-small" onClick={() => go('diary')}>Open food diary for {formatDate(date)}</button>
        </div>
      </Card>

      <Card title="Race preparation calendar">
        {!isValidISODate(athlete.raceDate) ? (
          <p className="muted">Set a race date in Athletes to build the calendar.</p>
        ) : (
          <>
            <p className="muted small">Dates are calculated from the race date. Leave a target blank to use the suggestion; type a value to override. Tap a date to open it.</p>
            <div className="table-wrap">
              <table className="table calendar">
                <thead>
                  <tr><th>Day</th><th>Date</th><th className="hide-sm">Phase</th><th className="num">g/kg</th><th className="num">Target</th><th className="num">Actual</th><th className="num">Left</th><th></th></tr>
                </thead>
                <tbody>
                  {CALENDAR.map(([offset, label], i) => {
                    const d = addDays(athlete.raceDate, offset);
                    const dt = dayTarget(data, athlete, d);
                    const act = sumEntries(entriesFor(data, athlete.id, d)).carbs;
                    const pr = progress(dt.targetG, act);
                    const dp = data.dayPlans[athlete.id]?.[d];
                    const group = offset <= -4 ? 'D-7 to D-4' : offset > 0 ? 'Post-race recovery' : null;
                    const prevGroup = i > 0 ? (CALENDAR[i - 1][0] <= -4 ? 'D-7 to D-4' : CALENDAR[i - 1][0] > 0 ? 'Post-race recovery' : null) : null;
                    return (
                      <React.Fragment key={d}>
                        {group && group !== prevGroup && <tr className="group-row"><td colSpan={8}>{group}</td></tr>}
                        <tr className={`${d === today ? 'row-today' : ''} ${d === date ? 'row-active' : ''} ${offset === 0 ? 'row-race' : ''}`}>
                          <td><button className="link" onClick={() => setDiaryDate(d)}>{label}</button></td>
                          <td>{formatDate(d)}</td>
                          <td className="small hide-sm">{phaseLabel(dt.phase)}</td>
                          <td className="num">
                            <input className="input-compact" type="number" inputMode="decimal" step="0.5" aria-label={`g/kg for ${label}`}
                              value={dp?.gPerKg ?? ''} placeholder={String(dt.suggested)}
                              onChange={(e) => update((x) => ops.setDayPlan(x, athlete.id, d, { phase: dp?.phase ?? null, gPerKg: e.target.value === '' ? '' : Number(e.target.value) }))} />
                          </td>
                          <td className="num">{fmt(pr.target)}</td>
                          <td className="num">{fmt(act)}</td>
                          <td className="num">{pr.remaining == null ? '—' : fmt(pr.remaining)}</td>
                          <td className="progress-cell"><Progress pct={pr.pct} size="sm" /></td>
                        </tr>
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
