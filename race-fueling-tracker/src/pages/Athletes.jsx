import React, { useState } from 'react';
import { Card, Field, Badge, fmt } from '../components/ui.jsx';
import * as ops from '../lib/ops.js';
import { RACE_TYPES, raceTypeLabel, isTriathlon } from '../lib/fueling.js';
import { isValidWeight, isValidGPerKg, dailyCarbTarget } from '../lib/calc.js';
import { parseDuration, parseClock, isValidISODate, formatDate } from '../lib/dates.js';
import { daysUntilLabel } from './Dashboard.jsx';

const SPORTS = ['Triathlon', 'Trail running', 'Road running', 'Cycling', 'Other'];

function validate(f) {
  const e = {};
  if (!String(f.name).trim()) e.name = 'Name is required.';
  if (f.weightKg !== '' && !isValidWeight(f.weightKg)) e.weightKg = 'Enter a weight between 25 and 250 kg (or leave blank).';
  if (f.age !== '' && !(Number(f.age) > 0 && Number(f.age) < 110)) e.age = 'Enter a valid age.';
  if (f.heightCm !== '' && !(Number(f.heightCm) >= 100 && Number(f.heightCm) <= 250)) e.heightCm = 'Enter height in cm (100–250).';
  if (f.raceDate && !isValidISODate(f.raceDate)) e.raceDate = 'Invalid date.';
  if (f.raceStartTime && parseClock(f.raceStartTime) == null) e.raceStartTime = 'Use HH:MM.';
  if (f.expectedFinish && parseDuration(f.expectedFinish) == null) e.expectedFinish = 'Use H:MM, e.g. 2:05.';
  if (!isValidGPerKg(f.dailyCarbGPerKg)) e.dailyCarbGPerKg = 'Enter 0–20 g/kg/day.';
  if (!(Number(f.raceCarbGPerHour) >= 0 && Number(f.raceCarbGPerHour) <= 150) || f.raceCarbGPerHour === '') e.raceCarbGPerHour = 'Enter 0–150 g/h.';
  return e;
}

function AthleteForm({ initial, onSave, onCancel }) {
  const [f, setF] = useState(initial);
  const [errors, setErrors] = useState({});
  const set = (k) => (ev) => setF((x) => ({ ...x, [k]: ev.target.value }));
  const onRaceType = (ev) => {
    const rt = RACE_TYPES.find((r) => r.key === ev.target.value);
    setF((x) => ({ ...x, raceType: rt.key, sport: rt.sport, raceDistanceKm: rt.distanceKm }));
  };
  const submit = (ev) => {
    ev.preventDefault();
    const e = validate(f);
    setErrors(e);
    if (Object.keys(e).length) return;
    const numeric = ['age', 'heightCm', 'weightKg', 'raceDistanceKm', 'elevationGainM', 'dailyCarbGPerKg', 'raceCarbGPerHour'];
    const out = { ...f, name: f.name.trim() };
    for (const k of numeric) out[k] = f[k] === '' ? '' : Number(f[k]);
    onSave(out);
  };
  const preview = dailyCarbTarget(f.weightKg, f.dailyCarbGPerKg);

  return (
    <form className="form" onSubmit={submit} noValidate>
      <div className="form-grid">
        <Field label="Name or nickname" error={errors.name} className="span-2"><input value={f.name} onChange={set('name')} /></Field>
        <Field label="Sex">
          <select value={f.sex} onChange={set('sex')}><option value="">—</option><option>Female</option><option>Male</option><option>Other</option></select>
        </Field>
        <Field label="Age" error={errors.age}><input type="number" inputMode="numeric" value={f.age} onChange={set('age')} /></Field>
        <Field label="Height (cm)" error={errors.heightCm}><input type="number" inputMode="decimal" value={f.heightCm} onChange={set('heightCm')} /></Field>
        <Field label="Weight (kg)" error={errors.weightKg} hint="Changes apply from today; past days keep their weight.">
          <input type="number" inputMode="decimal" step="0.1" value={f.weightKg} onChange={set('weightKg')} />
        </Field>
        <Field label="Race type">
          <select value={f.raceType} onChange={onRaceType}>{RACE_TYPES.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}</select>
        </Field>
        <Field label="Primary sport">
          <select value={f.sport} onChange={set('sport')}>{SPORTS.map((s) => <option key={s}>{s}</option>)}</select>
        </Field>
        <Field label="Race distance (km)"><input type="number" inputMode="decimal" step="0.01" value={f.raceDistanceKm} onChange={set('raceDistanceKm')} /></Field>
        <Field label="Race date" error={errors.raceDate}><input type="date" value={f.raceDate} onChange={set('raceDate')} /></Field>
        <Field label="Race start time" error={errors.raceStartTime}><input type="time" value={f.raceStartTime} onChange={set('raceStartTime')} /></Field>
        <Field label="Expected finish (H:MM)" error={errors.expectedFinish}><input placeholder="2:05" value={f.expectedFinish} onChange={set('expectedFinish')} /></Field>
        {(f.raceType === 'trail_20k' || f.elevationGainM !== '') && (
          <Field label="Elevation gain (m)"><input type="number" inputMode="numeric" value={f.elevationGainM} onChange={set('elevationGainM')} /></Field>
        )}
        <Field label="Daily carbs (g/kg/day)" error={errors.dailyCarbGPerKg}
          hint={preview != null ? `= ${fmt(preview)} g/day on normal days` : 'Baseline for normal training days.'}>
          <input type="number" inputMode="decimal" step="0.5" value={f.dailyCarbGPerKg} onChange={set('dailyCarbGPerKg')} />
        </Field>
        <Field label="Race-day carbs (g/hour)" error={errors.raceCarbGPerHour} hint="Use what the athlete has practised in training.">
          <input type="number" inputMode="numeric" step="5" value={f.raceCarbGPerHour} onChange={set('raceCarbGPerHour')} />
        </Field>
        <Field label="Food preferences & GI tolerance notes" className="span-2">
          <textarea rows={3} value={f.notes} onChange={set('notes')} />
        </Field>
      </div>
      <div className="form-actions">
        <button type="button" className="btn" onClick={onCancel}>Cancel</button>
        <button type="submit" className="btn btn-primary">Save athlete</button>
      </div>
    </form>
  );
}

export default function Athletes({ data, update, today, selectAthlete, athlete: selected }) {
  const [editing, setEditing] = useState(null); // athlete id | 'new' | null

  const save = (fields) => {
    if (editing === 'new') update((d) => ops.addAthlete(d, fields, today));
    else update((d) => ops.updateAthlete(d, editing, fields, today));
    setEditing(null);
  };
  const remove = (a) => {
    if (window.confirm(`Delete ${a.name}? This also deletes their food diary, race plan and hydration logs.`)) {
      update((d) => ops.deleteAthlete(d, a.id));
    }
  };

  const toForm = (a) => {
    const { id, isSample, weightHistory, ...rest } = a;
    return { ...ops.blankAthlete(), ...rest };
  };

  return (
    <div className="page">
      <Card title={`Athletes (${data.athletes.length})`} actions={
        editing !== 'new' && <button className="btn btn-primary btn-small" onClick={() => setEditing('new')}>+ Add athlete</button>
      }>
        <p className="muted small">The app is set up for a group of {ops.MAX_ATHLETES_DEFAULT}. You can add more if needed. Sample profiles use illustrative values only — edit or replace them.</p>
        {data.athletes.length >= ops.MAX_ATHLETES_DEFAULT && editing === 'new' && (
          <p className="warn">You already have {data.athletes.length} athletes (default group size is {ops.MAX_ATHLETES_DEFAULT}).</p>
        )}
        {editing === 'new' && <AthleteForm initial={ops.blankAthlete()} onSave={save} onCancel={() => setEditing(null)} />}
      </Card>

      <div className="athlete-grid">
        {data.athletes.map((a) => (
          <Card key={a.id} className={a.id === selected?.id ? 'card-selected' : ''}>
            {editing === a.id ? (
              <AthleteForm initial={toForm(a)} onSave={save} onCancel={() => setEditing(null)} />
            ) : (
              <>
                <div className="athlete-card-head">
                  <div>
                    <div className="h-name">{a.name}</div>
                    <div className="muted small">{raceTypeLabel(a.raceType)} · {a.sport}</div>
                  </div>
                  {a.isSample && <Badge>Sample data</Badge>}
                </div>
                <dl className="kv">
                  <dt>Race</dt><dd>{formatDate(a.raceDate)} {a.raceStartTime} <span className="muted">({daysUntilLabel(a.raceDate, today)})</span></dd>
                  <dt>Distance</dt><dd>{fmt(a.raceDistanceKm, 2)} km{a.elevationGainM !== '' && ` · ${fmt(a.elevationGainM)} m gain`}</dd>
                  <dt>Expected finish</dt><dd>{a.expectedFinish || '—'}</dd>
                  <dt>Body</dt><dd>{[a.sex, a.age && `${a.age} y`, a.heightCm && `${a.heightCm} cm`].filter(Boolean).join(' · ') || '—'}</dd>
                  <dt>Weight</dt><dd>{isValidWeight(a.weightKg) ? `${fmt(a.weightKg, 1)} kg` : <span className="warn-inline">missing</span>}</dd>
                  <dt>Daily carbs</dt><dd>{fmt(a.dailyCarbGPerKg, 1)} g/kg → {fmt(dailyCarbTarget(a.weightKg, a.dailyCarbGPerKg))} g/day</dd>
                  <dt>Race carbs</dt><dd>{fmt(a.raceCarbGPerHour)} g/h {isTriathlon(a.raceType) && <span className="muted">(bike + run)</span>}</dd>
                </dl>
                {a.notes && <p className="notes">{a.notes}</p>}
                <div className="row-actions">
                  <button className="btn btn-small" onClick={() => selectAthlete(a.id)} disabled={a.id === selected?.id}>{a.id === selected?.id ? 'Selected' : 'Select'}</button>
                  <button className="btn btn-small" onClick={() => setEditing(a.id)}>Edit</button>
                  <button className="btn btn-small btn-danger" onClick={() => remove(a)}>Delete</button>
                </div>
              </>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}
