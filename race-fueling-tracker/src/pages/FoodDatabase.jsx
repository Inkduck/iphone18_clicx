import React, { useMemo, useState } from 'react';
import { Card, Field, Badge, fmt } from '../components/ui.jsx';
import FoodPicker from '../components/FoodPicker.jsx';
import * as ops from '../lib/ops.js';
import { formatDate } from '../lib/dates.js';

const CATEGORIES = ['Grains', 'Fruit', 'Vegetables', 'Dairy', 'Protein', 'Snacks', 'Drinks', 'Sports nutrition', 'Other'];
const NUM_FIELDS = ['servingSize', 'carbs', 'protein', 'fat', 'kcal', 'sodiumMg', 'fluidMl'];
const SCALABLE = ['carbs', 'protein', 'fat', 'kcal', 'sodiumMg', 'fluidMl'];
const blank = { name: '', category: 'Other', servingSize: 100, servingUnit: 'g', carbs: '', protein: '', fat: '', kcal: '', sodiumMg: '', fluidMl: '', isEstimate: false };

function FoodForm({ initial, onSave, onCancel }) {
  const [f, setF] = useState(initial);
  const [scale, setScale] = useState(!!initial.id);
  const [err, setErr] = useState('');
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));

  const onServing = (e) => {
    const next = e.target.value;
    setF((x) => {
      const oldSize = Number(x.servingSize);
      const newSize = Number(next);
      if (!scale || !(oldSize > 0) || !(newSize > 0)) return { ...x, servingSize: next };
      const out = { ...x, servingSize: next };
      for (const k of SCALABLE) if (x[k] !== '' && Number.isFinite(Number(x[k]))) out[k] = Math.round((Number(x[k]) * newSize / oldSize) * 10) / 10;
      return out;
    });
  };

  const submit = (e) => {
    e.preventDefault();
    if (!f.name.trim()) return setErr('Name is required.');
    if (!(Number(f.servingSize) > 0)) return setErr('Serving size must be greater than 0.');
    if (f.carbs === '' || !(Number(f.carbs) >= 0)) return setErr('Carbohydrate (g) is required.');
    for (const k of NUM_FIELDS) if (f[k] !== '' && !(Number(f[k]) >= 0)) return setErr(`${k} must be a non-negative number.`);
    const out = { ...f, name: f.name.trim() };
    for (const k of NUM_FIELDS) out[k] = f[k] === '' ? (k === 'sodiumMg' || k === 'fluidMl' ? '' : 0) : Number(f[k]);
    onSave(out);
  };

  return (
    <form className="form" onSubmit={submit} noValidate>
      <div className="form-grid">
        <Field label="Food name" className="span-2"><input value={f.name} onChange={set('name')} /></Field>
        <Field label="Category"><select value={f.category} onChange={set('category')}>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></Field>
        <Field label="Serving size"><input type="number" inputMode="decimal" step="any" value={f.servingSize} onChange={onServing} /></Field>
        <Field label="Unit"><input value={f.servingUnit} onChange={set('servingUnit')} placeholder="g, ml, piece" /></Field>
        <Field label="Carbohydrate (g)"><input type="number" inputMode="decimal" step="any" value={f.carbs} onChange={set('carbs')} /></Field>
        <Field label="Protein (g)"><input type="number" inputMode="decimal" step="any" value={f.protein} onChange={set('protein')} /></Field>
        <Field label="Fat (g)"><input type="number" inputMode="decimal" step="any" value={f.fat} onChange={set('fat')} /></Field>
        <Field label="Calories (kcal)"><input type="number" inputMode="decimal" step="any" value={f.kcal} onChange={set('kcal')} /></Field>
        <Field label="Sodium (mg, optional)"><input type="number" inputMode="decimal" step="any" value={f.sodiumMg} onChange={set('sodiumMg')} /></Field>
        <Field label="Fluid (ml, optional)"><input type="number" inputMode="decimal" step="any" value={f.fluidMl} onChange={set('fluidMl')} /></Field>
      </div>
      <label className="inline small"><input type="checkbox" checked={scale} onChange={(e) => setScale(e.target.checked)} /> Scale nutrient values when serving size changes</label>
      <label className="inline small"><input type="checkbox" checked={!!f.isEstimate} onChange={(e) => setF({ ...f, isEstimate: e.target.checked })} /> Values are estimates</label>
      {err && <p className="field-error">{err}</p>}
      <div className="form-actions">
        <button type="button" className="btn" onClick={onCancel}>Cancel</button>
        <button type="submit" className="btn btn-primary">Save food</button>
      </div>
    </form>
  );
}

export default function FoodDatabase({ data, update, athlete, diaryDate }) {
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState(null); // food id | 'new'
  const [logging, setLogging] = useState(null); // food id
  const [msg, setMsg] = useState('');

  const foods = useMemo(() => {
    const s = q.trim().toLowerCase();
    return [...data.foods]
      .filter((f) => !s || f.name.toLowerCase().includes(s) || f.category.toLowerCase().includes(s))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [data.foods, q]);

  const save = (food) => { update((d) => ops.saveFood(d, food)); setEditing(null); };
  const del = (f) => window.confirm(`Delete "${f.name}" from the food database? Existing diary entries are kept.`) && update((d) => ops.deleteFood(d, f.id));

  return (
    <div className="page">
      <Card title={`Food database (${data.foods.length})`} actions={editing !== 'new' && <button className="btn btn-primary btn-small" onClick={() => setEditing('new')}>+ Add food</button>}>
        <p className="muted small">Default items are generic, illustrative estimates — not values for any specific brand. Check product labels and edit as needed.</p>
        {editing === 'new' && <FoodForm initial={blank} onSave={save} onCancel={() => setEditing(null)} />}
        <Field label="Search by name or category"><input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…" /></Field>
        {msg && <p className="ok small" role="status">{msg}</p>}
      </Card>

      <div className="food-list">
        {foods.length === 0 && <p className="muted">No foods match.</p>}
        {foods.map((f) => (
          <Card key={f.id} className="food-card">
            {editing === f.id ? (
              <FoodForm initial={f} onSave={save} onCancel={() => setEditing(null)} />
            ) : (
              <>
                <div className="food-head">
                  <div>
                    <strong>{f.name}</strong>
                    <div className="muted small">{f.category} · per {fmt(f.servingSize, 1)} {f.servingUnit} {f.isEstimate && <Badge>estimate</Badge>}</div>
                  </div>
                  <div className="entry-carbs">{fmt(f.carbs, 1)}<small>g carbs</small></div>
                </div>
                <div className="small muted">
                  {fmt(f.protein, 1)} g protein · {fmt(f.fat, 1)} g fat · {fmt(f.kcal)} kcal
                  {f.sodiumMg !== '' && ` · ${fmt(f.sodiumMg)} mg Na`}{f.fluidMl !== '' && ` · ${fmt(f.fluidMl)} ml`}
                </div>
                {logging === f.id && athlete ? (
                  <div className="log-inline">
                    <p className="small">Add to <strong>{athlete.name}</strong>'s diary on {formatDate(diaryDate)}:</p>
                    <FoodPicker foods={data.foods} initialFoodId={f.id} onAdd={(food, opts) => {
                      update((d) => ops.addEntry(d, ops.makeEntry(food, { athleteId: athlete.id, date: diaryDate, ...opts })));
                      setLogging(null);
                      setMsg(`Added ${food.name} to ${athlete.name}'s diary (${formatDate(diaryDate)}).`);
                    }} />
                    <button className="btn btn-small" onClick={() => setLogging(null)}>Cancel</button>
                  </div>
                ) : (
                  <div className="row-actions">
                    {athlete && <button className="btn btn-small btn-primary" onClick={() => setLogging(f.id)}>Add to meal log</button>}
                    <button className="btn btn-small" onClick={() => setEditing(f.id)}>Edit</button>
                    <button className="btn btn-small btn-danger" onClick={() => del(f)}>Delete</button>
                  </div>
                )}
              </>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}
