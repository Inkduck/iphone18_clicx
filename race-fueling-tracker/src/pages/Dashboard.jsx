import React from 'react';
import { Card, Stat, TargetSummary, Progress, Badge, fmt } from '../components/ui.jsx';
import { dayTarget, entriesFor, sumEntries, progress, phaseLabel } from '../lib/calc.js';
import { daysBetween, formatDate, isValidISODate } from '../lib/dates.js';
import { raceTypeLabel } from '../lib/fueling.js';

export function daysUntilLabel(raceDate, today) {
  if (!isValidISODate(raceDate)) return 'No race date';
  const d = daysBetween(today, raceDate);
  if (d === 0) return 'Race day!';
  if (d === 1) return 'Tomorrow';
  if (d > 0) return `${d} days`;
  return `${-d} days ago`;
}

export function athleteToday(data, athlete, date) {
  const t = dayTarget(data, athlete, date);
  const consumed = sumEntries(entriesFor(data, athlete.id, date)).carbs;
  return { t, ...progress(t.targetG, consumed) };
}

export default function Dashboard({ data, athlete, today, go, selectAthlete, setDiaryDate }) {
  const sel = athleteToday(data, athlete, today);
  const races = [...data.athletes]
    .filter((a) => isValidISODate(a.raceDate))
    .sort((a, b) => a.raceDate.localeCompare(b.raceDate));
  const upcoming = races.filter((a) => daysBetween(today, a.raceDate) >= 0);

  return (
    <div className="page">
      <div className="stat-grid stat-grid-top">
        <Card className="mini"><Stat label="Active athletes" value={data.athletes.length} /></Card>
        <Card className="mini"><Stat label="Upcoming races" value={upcoming.length} /></Card>
        <Card className="mini"><Stat label="Next race" value={upcoming[0] ? daysUntilLabel(upcoming[0].raceDate, today) : '—'}
          sub={upcoming[0]?.name} /></Card>
      </div>

      <Card title="Selected athlete — today" actions={
        <button className="btn btn-small" onClick={() => { setDiaryDate(today); go('diary'); }}>Log food</button>
      }>
        <div className="athlete-headline">
          <div>
            <div className="h-name">{athlete.name}</div>
            <div className="muted">{raceTypeLabel(athlete.raceType)} · {formatDate(athlete.raceDate)} · {daysUntilLabel(athlete.raceDate, today)}</div>
          </div>
          <div className="phase-pill">
            <span className="muted small">Phase</span>
            <strong>{phaseLabel(sel.t.phase)}</strong>
            {sel.t.phase !== sel.t.autoPhase && <span className="muted small">set manually</span>}
          </div>
        </div>
        <p className="muted small">
          Target {fmt(sel.t.gPerKg, 1)} g/kg/day × {sel.t.weightValid ? `${fmt(sel.t.weightKg, 1)} kg` : 'no valid weight'}
          {' '}<Badge tone={sel.t.source === 'custom' ? 'accent' : 'muted'}>{sel.t.source === 'custom' ? 'custom' : 'suggested'}</Badge>
        </p>
        <TargetSummary {...sel} invalidReason={!sel.t.weightValid ? 'Body weight is missing or invalid — add it in Athletes to calculate a target.' : null} />
      </Card>

      <Card title="Upcoming races">
        {races.length === 0 ? <p className="muted">No race dates set.</p> : (
          <ul className="race-list">
            {races.map((a) => {
              const d = daysBetween(today, a.raceDate);
              return (
                <li key={a.id} className={d < 0 ? 'past' : ''}>
                  <button className="link-row" onClick={() => { selectAthlete(a.id); go('race'); }}>
                    <span className="race-days">{d >= 0 ? d : '✓'}<small>{d >= 0 ? 'days' : 'done'}</small></span>
                    <span className="race-info">
                      <strong>{a.name}</strong>
                      <span className="muted small">{raceTypeLabel(a.raceType)} · {formatDate(a.raceDate)} {a.raceStartTime && `· ${a.raceStartTime}`}</span>
                    </span>
                    <span className="muted small">{phaseLabel(dayTarget(data, a, today).phase)}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Card title="Team comparison — today">
        <div className="table-wrap">
          <table className="table compare">
            <thead>
              <tr><th>Athlete</th><th>Sport</th><th>Race date</th><th className="num">Weight</th><th className="num">Target g/day</th><th className="num">Eaten</th><th>Progress</th></tr>
            </thead>
            <tbody>
              {data.athletes.map((a) => {
                const r = athleteToday(data, a, today);
                return (
                  <tr key={a.id} className={a.id === athlete.id ? 'row-active' : ''} onClick={() => selectAthlete(a.id)}>
                    <td><strong>{a.name}</strong></td>
                    <td>{a.sport || '—'}</td>
                    <td>{formatDate(a.raceDate, { day: 'numeric', month: 'short' })}</td>
                    <td className="num">{r.t.weightValid ? `${fmt(r.t.weightKg, 1)} kg` : '—'}</td>
                    <td className="num">{fmt(r.target)}</td>
                    <td className="num">{fmt(r.consumed)}</td>
                    <td className="progress-cell"><Progress pct={r.pct} size="sm" /><span className="small">{r.pct == null ? '—' : `${r.pct}%`}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="muted small">Tap a row to select that athlete.</p>
      </Card>
    </div>
  );
}
