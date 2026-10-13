import React, { useState } from 'react';
import { Card, Field, Stat, Progress, Badge, fmt } from '../components/ui.jsx';
import * as ops from '../lib/ops.js';
import {
  raceMetrics, raceTypeLabel, isTriathlon, canFuelSegment, segmentBounds, segmentAt,
  plannedCarbs, actualCarbs, STATUSES, suggestInterval, planDuration,
} from '../lib/fueling.js';
import { clockPlus, formatDate, formatDuration, parseDuration } from '../lib/dates.js';
import { uid } from '../lib/ids.js';

const STATUS_LABEL = { planned: 'Planned', consumed: 'Consumed', skipped: 'Skipped', replaced: 'Replaced' };
const n = (v) => (v === '' ? '' : Number(v));

function SegmentEditor({ seg, onChange, gph }) {
  const fuelable = canFuelSegment(seg.type);
  const set = (k, v) => onChange({ ...seg, [k]: v });
  const setProd = (k, v) => onChange({ ...seg, product: { ...seg.product, [k]: v } });
  return (
    <div className={`segment seg-${seg.type}`}>
      <div className="segment-head">
        <strong>{seg.name}</strong>
        <label className="inline">
          <span className="small muted">Duration (min)</span>
          <input className="input-compact" type="number" inputMode="numeric" min="0" value={seg.durationMin} onChange={(e) => set('durationMin', n(e.target.value))} />
        </label>
        {fuelable ? (
          <label className="inline"><input type="checkbox" checked={!!seg.fuel} onChange={(e) => set('fuel', e.target.checked)} /> <span className="small">Fuel in this segment</span></label>
        ) : (
          <span className="small muted">{seg.type === 'swim' ? 'No carbohydrate intake scheduled during the swim.' : 'Transition — no scheduled fueling.'}</span>
        )}
      </div>
      {fuelable && seg.fuel && (
        <div className="form-grid seg-grid">
          <Field label="Product"><input value={seg.product.name} onChange={(e) => setProd('name', e.target.value)} /></Field>
          <Field label="Carbs / serving (g)"><input type="number" inputMode="decimal" value={seg.product.carbs} onChange={(e) => setProd('carbs', n(e.target.value))} /></Field>
          <Field label="Fluid / serving (ml)"><input type="number" inputMode="numeric" value={seg.product.fluidMl} onChange={(e) => setProd('fluidMl', n(e.target.value))} /></Field>
          <Field label="Sodium / serving (mg)"><input type="number" inputMode="numeric" value={seg.product.sodiumMg} onChange={(e) => setProd('sodiumMg', n(e.target.value))} /></Field>
          <Field label="Every (min)" hint={`≈${suggestInterval(gph, seg.product.carbs)} min matches ${fmt(gph)} g/h`}>
            <input type="number" inputMode="numeric" min="5" value={seg.intervalMin} onChange={(e) => set('intervalMin', n(e.target.value))} />
          </Field>
          <Field label="First feed after (min)"><input type="number" inputMode="numeric" min="5" value={seg.firstAtMin} onChange={(e) => set('firstAtMin', n(e.target.value))} /></Field>
        </div>
      )}
    </div>
  );
}

function EventRow({ ev, plan, startTime, cum, onChange, onDelete }) {
  const seg = segmentAt(plan, ev.elapsedMin);
  const set = (k, v) => onChange({ ...ev, [k]: v });
  const badSeg = seg && !canFuelSegment(seg.type);
  return (
    <li className={`event status-${ev.status}`}>
      <div className="event-top">
        <label className="event-time">
          <span className="sr-only">Elapsed minutes</span>
          <input className="input-compact" type="number" inputMode="numeric" min="0" value={ev.elapsedMin} onChange={(e) => set('elapsedMin', Number(e.target.value) || 0)} />
          <span className="small muted">min · {formatDuration(ev.elapsedMin)}</span>
        </label>
        <span className="event-clock">{clockPlus(startTime, ev.elapsedMin) ?? '—'}</span>
        <Badge tone={badSeg ? 'danger' : 'muted'}>{seg?.name ?? '—'}</Badge>
        <button className="btn btn-small btn-danger" onClick={onDelete} aria-label="Delete event">✕</button>
      </div>
      <div className="event-body">
        <input className="event-product" value={ev.product} onChange={(e) => set('product', e.target.value)} aria-label="Product" />
        <label className="inline small">× <input className="input-compact" type="number" step="0.5" min="0" value={ev.servings} onChange={(e) => set('servings', n(e.target.value))} aria-label="Servings" /></label>
        <label className="inline small"><input className="input-compact" type="number" min="0" value={ev.carbsPerServing} onChange={(e) => set('carbsPerServing', n(e.target.value))} aria-label="Carbs per serving" /> g</label>
        <label className="inline small"><input className="input-compact" type="number" min="0" value={ev.fluidMl} onChange={(e) => set('fluidMl', n(e.target.value))} aria-label="Fluid per serving" /> ml</label>
        <label className="inline small"><input className="input-compact" type="number" min="0" value={ev.sodiumMg} onChange={(e) => set('sodiumMg', n(e.target.value))} aria-label="Sodium per serving" /> mg Na</label>
      </div>
      <div className="status-buttons" role="group" aria-label="Status">
        {STATUSES.map((s) => (
          <button key={s} className={`status-btn ${ev.status === s ? `on s-${s}` : ''}`} onClick={() => set('status', s)}>{STATUS_LABEL[s]}</button>
        ))}
      </div>
      {ev.status === 'replaced' && (
        <div className="event-body">
          <input placeholder="Replaced with…" value={ev.replacement} onChange={(e) => set('replacement', e.target.value)} aria-label="Replacement product" />
          <label className="inline small"><input className="input-compact" type="number" min="0" value={ev.replacementCarbs} onChange={(e) => set('replacementCarbs', n(e.target.value))} aria-label="Replacement carbs" /> g carbs actually taken</label>
        </div>
      )}
      <div className="small muted event-foot">
        Planned {fmt(plannedCarbs(ev), 1)} g · Actual {fmt(actualCarbs(ev), 1)} g · Cumulative {fmt(cum?.cumActual)} / {fmt(cum?.cumPlanned)} g
        {ev.note && ` · ${ev.note}`}
        {badSeg && <span className="warn-inline"> · falls in {seg.name} — move it to bike or run</span>}
      </div>
    </li>
  );
}

export default function RaceDay({ data, update, athlete, today }) {
  const plan = data.racePlans[athlete.id];
  const [newAt, setNewAt] = useState('');
  const [addErr, setAddErr] = useState('');
  if (!plan) {
    return <Card title="Race day"><button className="btn btn-primary" onClick={() => update((d) => ops.resetRacePlan(d, athlete.id))}>Create race plan</button></Card>;
  }
  const tri = isTriathlon(athlete.raceType);
  const m = raceMetrics(plan);
  const expected = parseDuration(athlete.expectedFinish);
  const outOfSync = plan.raceType !== athlete.raceType || (!tri && expected && Math.round(expected) !== Math.round(m.durationMin));
  const triMismatch = tri && expected && Math.abs(expected - m.durationMin) >= 1;
  const gph = Number(athlete.raceCarbGPerHour) || 0;
  const anyLogged = plan.events.some((e) => e.status !== 'planned');

  const setPlan = (fn) => update((d) => ops.updateRacePlan(d, athlete.id, fn));
  const setField = (k, v) => setPlan((p) => ({ ...p, [k]: v }));
  const setAthlete = (fields) => update((d) => ops.updateAthlete(d, athlete.id, fields, today));
  const setSegment = (seg) => setPlan((p) => ({ ...p, segments: p.segments.map((s) => (s.id === seg.id ? seg : s)) }));
  const setEvent = (ev) => setPlan((p) => ({ ...p, events: p.events.map((e) => (e.id === ev.id ? ev : e)) }));
  const delEvent = (id) => setPlan((p) => ({ ...p, events: p.events.filter((e) => e.id !== id) }));
  const sortEvents = () => setPlan((p) => ({ ...p, events: [...p.events].sort((a, b) => a.elapsedMin - b.elapsedMin) }));

  const regenerate = () => {
    if (anyLogged && !window.confirm('Regenerating replaces the timeline, including items already marked consumed/skipped. Continue?')) return;
    update((d) => ops.regenerateRacePlan(d, athlete.id));
  };
  const rebuild = () => {
    if (!window.confirm('Rebuild segments and timeline from the athlete profile? Custom segment settings and logged items will be replaced.')) return;
    update((d) => ops.resetRacePlan(d, athlete.id));
  };
  const addEvent = (e) => {
    e.preventDefault();
    const t = Number(newAt);
    if (!(t >= 0) || newAt === '') { setAddErr('Enter elapsed minutes.'); return; }
    const seg = segmentAt(plan, t);
    if (seg && !canFuelSegment(seg.type)) { setAddErr(`${t} min is in the ${seg.name}. Carbohydrate intake is not scheduled during swim or transitions.`); return; }
    const prod = seg?.product ?? { name: 'Product', carbs: 0, fluidMl: 0, sodiumMg: 0 };
    setPlan((p) => ({
      ...p,
      events: [...p.events, {
        id: uid(), elapsedMin: Math.round(t), segmentId: seg?.id, product: prod.name, servings: 1,
        carbsPerServing: Number(prod.carbs) || 0, fluidMl: Number(prod.fluidMl) || 0, sodiumMg: Number(prod.sodiumMg) || 0,
        status: 'planned', replacement: '', replacementCarbs: '', note: 'Added manually',
      }].sort((a, b) => a.elapsedMin - b.elapsedMin),
    }));
    setNewAt('');
    setAddErr('');
  };

  const cumById = Object.fromEntries(m.cumulative.map((c) => [c.id, c]));
  const scheduledPerHour = m.hours > 0 ? m.scheduled / m.hours : null;
  const racePct = m.target ? Math.round((m.actual / m.target) * 100) : null;
  const bounds = segmentBounds(plan.segments);

  return (
    <div className="page">
      <Card title={`Race day — ${athlete.name}`}>
        <p className="muted small">
          {raceTypeLabel(athlete.raceType)} · {formatDate(athlete.raceDate)} · {fmt(athlete.raceDistanceKm, 2)} km
          {athlete.elevationGainM !== '' && ` · ${fmt(athlete.elevationGainM)} m elevation gain`}
        </p>
        {outOfSync && (
          <p className="warn">The race type or expected finish changed since this plan was built.{' '}
            <button className="link" onClick={rebuild}>Rebuild from profile</button>
          </p>
        )}
        <div className="form-grid">
          <Field label="Race start time"><input type="time" value={athlete.raceStartTime} onChange={(e) => setAthlete({ raceStartTime: e.target.value })} /></Field>
          <Field label="Expected finish (H:MM)" error={athlete.expectedFinish && !expected ? 'Use H:MM' : null}>
            <input value={athlete.expectedFinish} onChange={(e) => setAthlete({ expectedFinish: e.target.value })} placeholder="2:05" />
          </Field>
          <Field label="Carb target (g/hour)" hint="Choose a rate the athlete has practised.">
            <input type="number" inputMode="numeric" min="0" max="150" step="5" value={athlete.raceCarbGPerHour}
              onChange={(e) => setAthlete({ raceCarbGPerHour: e.target.value === '' ? '' : Number(e.target.value) })} />
          </Field>
          {athlete.raceType === 'trail_20k' && (
            <Field label="Elevation gain (m)"><input type="number" inputMode="numeric" value={athlete.elevationGainM} onChange={(e) => setAthlete({ elevationGainM: n(e.target.value) })} /></Field>
          )}
        </div>
      </Card>

      <Card title="Pre-race meal">
        <div className="form-grid">
          <Field label="Carb target (g)" hint={`Editable starting point (~1–4 g/kg, 1–4 h before is common guidance)`}>
            <input type="number" inputMode="numeric" value={plan.preRaceMealCarbs} onChange={(e) => setField('preRaceMealCarbs', n(e.target.value))} />
          </Field>
          <Field label="Hours before start">
            <input type="number" inputMode="decimal" step="0.5" value={plan.preRaceMealHoursBefore} onChange={(e) => setField('preRaceMealHoursBefore', n(e.target.value))} />
          </Field>
          <Field label="Eat at"><div className="readout">{clockPlus(athlete.raceStartTime, -(Number(plan.preRaceMealHoursBefore) || 0) * 60) ?? '—'}</div></Field>
          <Field label="Status">
            <label className="inline"><input type="checkbox" checked={!!plan.preRaceMealDone} onChange={(e) => setField('preRaceMealDone', e.target.checked)} /> Eaten</label>
          </Field>
        </div>
      </Card>

      <Card title={tri ? 'Segments (Swim · T1 · Bike · T2 · Run)' : 'Fueling strategy'}>
        {!tri && (
          <div className="form-grid">
            <Field label="Schedule by">
              <select value={plan.strategy} onChange={(e) => setField('strategy', e.target.value)}>
                <option value="interval">Fixed time interval</option>
                <option value="stations">{athlete.raceType === 'trail_20k' ? 'Aid stations' : 'Water stations'} (km)</option>
              </select>
            </Field>
            <Field label={`${athlete.raceType === 'trail_20k' ? 'Aid' : 'Water'} stations at km`} hint="Comma-separated. Times estimated from even pacing — adjust for climbs.">
              <input value={plan.stationsKm} onChange={(e) => setField('stationsKm', e.target.value)} placeholder="5, 10, 15" />
            </Field>
            {athlete.raceType === 'trail_20k' && (
              <Field label="Aid-station notes" className="span-2"><textarea rows={2} value={plan.aidNotes} onChange={(e) => setField('aidNotes', e.target.value)} placeholder="What each station stocks, cut-offs, bottle refills…" /></Field>
            )}
          </div>
        )}
        {plan.segments.map((s) => <SegmentEditor key={s.id} seg={s} gph={gph} onChange={setSegment} />)}
        <p className="small muted">Plan duration: <strong>{formatDuration(m.durationMin)}</strong>
          {tri && ` (${bounds.map((b) => `${b.name} ${formatDuration(b.durationMin)}`).join(' · ')})`}</p>
        {triMismatch && <p className="warn">Segment durations total {formatDuration(m.durationMin)} but expected finish is {athlete.expectedFinish}. Calculations use the segment total.</p>}
        <div className="row-actions">
          <button className="btn btn-primary" onClick={regenerate}>Generate timeline</button>
          <button className="btn" onClick={rebuild}>Rebuild from profile</button>
        </div>
      </Card>

      <Card title="Planned vs actual">
        <div className="stat-grid">
          <Stat label="Race carb target" value={fmt(m.target)} unit="g" sub={`${fmt(gph)} g/h × ${fmt(m.hours, 2)} h`} />
          <Stat label="Scheduled" value={fmt(m.scheduled)} unit="g" sub={scheduledPerHour != null ? `≈ ${fmt(scheduledPerHour)} g/h` : null} />
          <Stat label="Consumed" value={fmt(m.actual)} unit="g" sub={racePct != null ? `${racePct}% of target` : null} />
          <Stat label="Actual g/hour" value={m.actualPerHour == null ? '—' : fmt(m.actualPerHour)} unit="g/h" sub={m.lastLogged ? `through ${formatDuration(m.lastLogged)}` : 'log an item to start'} />
          <Stat label="On plan so far" value={m.lastLogged ? `${fmt(m.actual)} / ${fmt(m.plannedToLast)}` : '—'} unit="g" sub="actual / planned to last logged item" />
          <Stat label="Fluid · sodium taken" value={`${fmt(m.fluid)} ml`} sub={`${fmt(m.sodium)} mg sodium`} />
        </div>
        <Progress pct={racePct} />
        {m.target != null && Math.abs(m.scheduled - m.target) > Math.max(15, m.target * 0.15) && (
          <p className="info">Scheduled total differs from target by {fmt(m.scheduled - m.target)} g — adjust the interval, servings or product if that isn't intended.</p>
        )}
        {m.heavyHours.length > 0 && <p className="warn">Hour {m.heavyHours.map((h) => h.hour).join(', ')} has a heavy load ({m.heavyHours.map((h) => `${fmt(h.planned)} g`).join(', ')}). Spread intake evenly and only use rates practised in training.</p>}
        {m.swimConflicts.length > 0 && <p className="warn">{m.swimConflicts.length} item(s) fall in the swim or a transition.</p>}
        <p className="muted small">If a feed is missed, simply resume the normal schedule — don't double up to "catch up". Large amounts in a short period raise the risk of GI distress.</p>
      </Card>

      <Card title={`Fueling timeline (${plan.events.length})`} actions={<button className="btn btn-small" onClick={sortEvents}>Sort</button>}>
        {plan.events.length === 0 && <p className="muted">No fueling events. Set an expected finish and g/hour target, then Generate timeline.</p>}
        <ul className="events">
          {plan.events.map((ev) => (
            <EventRow key={ev.id} ev={ev} plan={plan} startTime={athlete.raceStartTime} cum={cumById[ev.id]}
              onChange={setEvent} onDelete={() => window.confirm('Delete this fueling event?') && delEvent(ev.id)} />
          ))}
        </ul>
        <form className="add-event" onSubmit={addEvent}>
          <Field label="Add event at elapsed minute" error={addErr}>
            <input type="number" inputMode="numeric" min="0" max={planDuration(plan)} value={newAt} onChange={(e) => setNewAt(e.target.value)} />
          </Field>
          <button className="btn" type="submit">+ Add</button>
        </form>
      </Card>

      {m.hourly.length > 0 && (
        <Card title="Hour by hour">
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Hour</th><th className="num">Planned g</th><th className="num">Actual g</th><th className="num">Target g</th><th></th></tr></thead>
              <tbody>
                {m.hourly.map((h) => {
                  const span = Math.min(60, m.durationMin - (h.hour - 1) * 60);
                  const tgt = (gph * span) / 60;
                  return (
                    <tr key={h.hour}>
                      <td>{h.hour}{span < 60 && <span className="muted small"> ({Math.round(span)} min)</span>}</td>
                      <td className="num">{fmt(h.planned)}</td>
                      <td className="num">{fmt(h.actual)}</td>
                      <td className="num">{fmt(tgt)}</td>
                      <td className="progress-cell"><Progress pct={tgt > 0 ? Math.round((h.actual / tgt) * 100) : null} size="sm" /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="muted small">Hourly target = g/h × minutes in that hour. For triathlon, the swim hour will read low by design.</p>
        </Card>
      )}
    </div>
  );
}
