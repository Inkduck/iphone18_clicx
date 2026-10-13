import React, { useState } from 'react';
import { Card, Field, Stat, TargetSummary, Badge, Progress, fmt } from '../components/ui.jsx';
import FoodPicker, { MEALS } from '../components/FoodPicker.jsx';
import { dayTarget, entriesFor, hydrationFor, sumEntries, progress, phaseLabel } from '../lib/calc.js';
import { addDays, formatDate } from '../lib/dates.js';
import * as ops from '../lib/ops.js';

function EntryRow({ e, update }) {
  const [edit, setEdit] = useState(false);
  const [f, setF] = useState({ amount: e.amount, meal: e.meal, time: e.time, notes: e.notes });
  const save = () => {
    if (!(Number(f.amount) > 0)) return;
    update((d) => ops.updateEntry(d, e.id, { ...f, amount: Number(f.amount) }));
    setEdit(false);
  };
  const del = () => window.confirm(`Delete "${e.foodName}"?`) && update((d) => ops.deleteEntry(d, e.id));

  if (edit) {
    return (
      <li className="entry entry-edit">
        <strong>{e.foodName}</strong>
        <div className="form-grid">
          <Field label={`Amount (${e.unit})`}><input type="number" step="any" inputMode="decimal" value={f.amount} onChange={(ev) => setF({ ...f, amount: ev.target.value })} /></Field>
          <Field label="Meal"><select value={f.meal} onChange={(ev) => setF({ ...f, meal: ev.target.value })}>{MEALS.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}</select></Field>
          <Field label="Time"><input type="time" value={f.time} onChange={(ev) => setF({ ...f, time: ev.target.value })} /></Field>
          <Field label="Notes"><input value={f.notes} onChange={(ev) => setF({ ...f, notes: ev.target.value })} /></Field>
        </div>
        <div className="row-actions">
          <button className="btn btn-small" onClick={() => setEdit(false)}>Cancel</button>
          <button className="btn btn-small btn-primary" onClick={save} disabled={!(Number(f.amount) > 0)}>Save</button>
        </div>
      </li>
    );
  }
  return (
    <li className="entry">
      <div className="entry-main">
        <div><strong>{e.foodName}</strong> <span className="muted small">{fmt(e.amount, 1)} {e.unit}{e.time && ` · ${e.time}`}</span></div>
        <div className="small muted">
          {fmt(e.protein, 1)} P · {fmt(e.fat, 1)} F · {fmt(e.kcal)} kcal
          {e.sodiumMg > 0 && ` · ${fmt(e.sodiumMg)} mg Na`}{e.fluidMl > 0 && ` · ${fmt(e.fluidMl)} ml`}
        </div>
        {e.notes && <div className="small notes">{e.notes}</div>}
      </div>
      <div className="entry-carbs">{fmt(e.carbs, 1)}<small>g carbs</small></div>
      <div className="entry-actions">
        <button className="btn btn-small" onClick={() => setEdit(true)} aria-label={`Edit ${e.foodName}`}>Edit</button>
        <button className="btn btn-small btn-danger" onClick={del} aria-label={`Delete ${e.foodName}`}>✕</button>
      </div>
    </li>
  );
}

function Hydration({ data, update, athlete, date }) {
  const logs = hydrationFor(data, athlete.id, date).sort((a, b) => a.time.localeCompare(b.time));
  const target = data.hydrationTargets[athlete.id] ?? { fluidMl: '', sodiumMg: '', note: '' };
  const foodTotals = sumEntries(entriesFor(data, athlete.id, date));
  const [f, setF] = useState({ time: '', waterMl: '', sportsDrinkMl: '', sodiumMg: '', notes: '' });
  const water = logs.reduce((a, h) => a + (Number(h.waterMl) || 0), 0);
  const drink = logs.reduce((a, h) => a + (Number(h.sportsDrinkMl) || 0), 0);
  const sodium = logs.reduce((a, h) => a + (Number(h.sodiumMg) || 0), 0);
  const fluid = water + drink;
  const setT = (k) => (e) => update((d) => ops.setHydrationTarget(d, athlete.id, { ...target, [k]: e.target.value === '' ? '' : (k === 'note' ? e.target.value : Number(e.target.value)) }));
  const add = (e) => {
    e.preventDefault();
    if (!(Number(f.waterMl) > 0 || Number(f.sportsDrinkMl) > 0 || Number(f.sodiumMg) > 0)) return;
    update((d) => ops.addHydration(d, {
      athleteId: athlete.id, date, time: f.time, notes: f.notes,
      waterMl: Number(f.waterMl) || 0, sportsDrinkMl: Number(f.sportsDrinkMl) || 0, sodiumMg: f.sodiumMg === '' ? '' : Number(f.sodiumMg),
    }));
    setF({ time: '', waterMl: '', sportsDrinkMl: '', sodiumMg: '', notes: '' });
  };
  const fluidPct = Number(target.fluidMl) > 0 ? Math.round((fluid / target.fluidMl) * 100) : null;

  return (
    <Card title="Hydration (optional)">
      <p className="muted small">No universal fluid or sodium target is applied. Enter your own strategy (e.g. from a coach or sweat test) if you want to track against it.</p>
      <div className="form-grid">
        <Field label="Your fluid target (ml/day)" hint="User-entered"><input type="number" inputMode="numeric" value={target.fluidMl} onChange={setT('fluidMl')} /></Field>
        <Field label="Your sodium target (mg/day)" hint="User-entered"><input type="number" inputMode="numeric" value={target.sodiumMg} onChange={setT('sodiumMg')} /></Field>
        <Field label="Strategy note" className="span-2"><input value={target.note} onChange={setT('note')} placeholder="e.g. 500 ml with each meal, extra after sessions" /></Field>
      </div>
      <div className="stat-grid">
        <Stat label="Fluid logged" value={fmt(fluid)} unit="ml" sub={Number(target.fluidMl) > 0 ? `of ${fmt(target.fluidMl)} ml your target` : 'no target set'} />
        <Stat label="Water / sports drink" value={`${fmt(water)} / ${fmt(drink)}`} unit="ml" />
        <Stat label="Sodium logged" value={fmt(sodium)} unit="mg" sub={Number(target.sodiumMg) > 0 ? `of ${fmt(target.sodiumMg)} mg your target` : 'no target set'} />
      </div>
      {fluidPct != null && <Progress pct={fluidPct} />}
      <p className="muted small">Separately, foods logged above contain an estimated {fmt(foodTotals.fluidMl)} ml fluid and {fmt(foodTotals.sodiumMg)} mg sodium (from food database estimates; not included in the hydration log totals).</p>

      <form className="form-grid hyd-form" onSubmit={add}>
        <Field label="Time"><input type="time" value={f.time} onChange={(e) => setF({ ...f, time: e.target.value })} /></Field>
        <Field label="Water (ml)"><input type="number" inputMode="numeric" value={f.waterMl} onChange={(e) => setF({ ...f, waterMl: e.target.value })} /></Field>
        <Field label="Sports drink (ml)"><input type="number" inputMode="numeric" value={f.sportsDrinkMl} onChange={(e) => setF({ ...f, sportsDrinkMl: e.target.value })} /></Field>
        <Field label="Sodium (mg, if known)"><input type="number" inputMode="numeric" value={f.sodiumMg} onChange={(e) => setF({ ...f, sodiumMg: e.target.value })} /></Field>
        <Field label="Notes" className="span-2"><input value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
        <div className="span-2"><button className="btn btn-primary" type="submit">Log hydration</button></div>
      </form>
      {logs.length > 0 && (
        <ul className="entries">
          {logs.map((h) => (
            <li className="entry" key={h.id}>
              <div className="entry-main">
                <div><strong>{h.time || '—'}</strong> <span className="small">{h.waterMl > 0 && `${fmt(h.waterMl)} ml water `}{h.sportsDrinkMl > 0 && `${fmt(h.sportsDrinkMl)} ml sports drink `}{h.sodiumMg !== '' && h.sodiumMg > 0 && `· ${fmt(h.sodiumMg)} mg Na`}</span></div>
                {h.notes && <div className="small notes">{h.notes}</div>}
              </div>
              <div className="entry-actions">
                <button className="btn btn-small btn-danger" onClick={() => window.confirm('Delete this hydration entry?') && update((d) => ops.deleteHydration(d, h.id))}>✕</button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export default function FoodDiary({ data, update, athlete, today, diaryDate: date, setDiaryDate }) {
  const entries = entriesFor(data, athlete.id, date);
  const totals = sumEntries(entries);
  const t = dayTarget(data, athlete, date);
  const p = progress(t.targetG, totals.carbs);
  const [copyFrom, setCopyFrom] = useState('');
  const [copyMeal, setCopyMeal] = useState('all');
  const [msg, setMsg] = useState('');
  const [showPicker, setShowPicker] = useState(true);

  const src = copyFrom || addDays(date, -1);
  const doCopy = () => {
    if (src === date) { setMsg('Choose a different source date.'); return; }
    const { count } = ops.copyEntries(data, athlete.id, src, date, copyMeal);
    if (count) update((d) => ops.copyEntries(d, athlete.id, src, date, copyMeal).data);
    setMsg(count ? `Copied ${count} item(s) from ${formatDate(src)}.` : `Nothing to copy on ${formatDate(src)}.`);
  };

  const add = (food, opts) => {
    update((d) => ops.addEntry(d, ops.makeEntry(food, { athleteId: athlete.id, date, ...opts })));
    setMsg(`Added ${food.name}.`);
  };

  return (
    <div className="page">
      <Card>
        <div className="date-nav">
          <button className="btn" onClick={() => setDiaryDate(addDays(date, -1))} aria-label="Previous day">‹</button>
          <div className="date-nav-center">
            <input type="date" value={date} onChange={(e) => e.target.value && setDiaryDate(e.target.value)} aria-label="Diary date" />
            <div className="small muted">{formatDate(date, { weekday: 'long', day: 'numeric', month: 'long' })}{date === today && ' · Today'}</div>
          </div>
          <button className="btn" onClick={() => setDiaryDate(addDays(date, 1))} aria-label="Next day">›</button>
        </div>
        {date !== today && <div className="center"><button className="link" onClick={() => setDiaryDate(today)}>Jump to today</button></div>}
      </Card>

      <Card title={`${athlete.name} — daily summary`}>
        <p className="muted small">{phaseLabel(t.phase)} · {fmt(t.gPerKg, 1)} g/kg/day <Badge tone={t.source === 'custom' ? 'accent' : 'muted'}>{t.source}</Badge></p>
        <TargetSummary {...p} invalidReason={!t.weightValid ? 'No carbohydrate target: body weight is missing or invalid.' : null} />
        <div className="stat-grid stat-grid-6">
          <Stat label="Protein" value={fmt(totals.protein)} unit="g" />
          <Stat label="Fat" value={fmt(totals.fat)} unit="g" />
          <Stat label="Calories" value={fmt(totals.kcal)} unit="kcal" />
          <Stat label="Fluid (food)" value={fmt(totals.fluidMl)} unit="ml" />
          <Stat label="Sodium (food)" value={fmt(totals.sodiumMg)} unit="mg" />
          <Stat label="Entries" value={entries.length} />
        </div>
      </Card>

      <Card title="Add food" actions={<button className="btn btn-small" onClick={() => setShowPicker((s) => !s)}>{showPicker ? 'Hide' : 'Show'}</button>}>
        {showPicker && <FoodPicker foods={data.foods} onAdd={add} />}
        {msg && <p className="ok small" role="status">{msg}</p>}
      </Card>

      {MEALS.map((m) => {
        const list = entries.filter((e) => e.meal === m.key).sort((a, b) => (a.time || '').localeCompare(b.time || ''));
        const mt = sumEntries(list);
        return (
          <Card key={m.key} className="meal-card" title={m.label} actions={<span className="muted small">{fmt(mt.carbs, 1)} g carbs · {fmt(mt.kcal)} kcal</span>}>
            {list.length === 0 ? <p className="muted small">Nothing logged.</p> : (
              <ul className="entries">{list.map((e) => <EntryRow key={e.id} e={e} update={update} />)}</ul>
            )}
          </Card>
        );
      })}

      <Card title="Copy meals from another day">
        <div className="form-grid">
          <Field label="From date"><input type="date" value={src} onChange={(e) => setCopyFrom(e.target.value)} /></Field>
          <Field label="Which meals">
            <select value={copyMeal} onChange={(e) => setCopyMeal(e.target.value)}>
              <option value="all">All meals</option>
              {MEALS.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
            </select>
          </Field>
        </div>
        <button className="btn" onClick={doCopy}>Copy to {formatDate(date)}</button>
      </Card>

      <Hydration data={data} update={update} athlete={athlete} date={date} />
    </div>
  );
}
