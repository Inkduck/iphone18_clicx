import React, { useMemo, useState } from 'react';
import { Field, fmt } from './ui.jsx';
import { scaleNutrients } from '../lib/calc.js';

export const MEALS = [
  { key: 'breakfast', label: 'Breakfast' },
  { key: 'morning_snack', label: 'Morning snack' },
  { key: 'lunch', label: 'Lunch' },
  { key: 'afternoon_snack', label: 'Afternoon snack' },
  { key: 'dinner', label: 'Dinner' },
  { key: 'evening_snack', label: 'Evening snack' },
  { key: 'other', label: 'Other' },
];

const nowClock = () => {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

/** Search the food database, choose amount + meal, and submit. */
export default function FoodPicker({ foods, onAdd, defaultMeal = 'breakfast', initialFoodId = null, submitLabel = 'Add to diary' }) {
  const [q, setQ] = useState('');
  const [foodId, setFoodId] = useState(initialFoodId);
  const food = foods.find((f) => f.id === foodId) ?? null;
  const [amount, setAmount] = useState(food ? String(food.servingSize) : '');
  const [meal, setMeal] = useState(defaultMeal);
  const [time, setTime] = useState(nowClock);
  const [notes, setNotes] = useState('');

  const matches = useMemo(() => {
    const s = q.trim().toLowerCase();
    return foods.filter((f) => !s || f.name.toLowerCase().includes(s) || f.category.toLowerCase().includes(s)).slice(0, 30);
  }, [foods, q]);

  const choose = (f) => { setFoodId(f.id); setAmount(String(f.servingSize)); };
  const amountOk = Number(amount) > 0;
  const scaled = food && amountOk ? scaleNutrients(food, amount) : null;

  const submit = (e) => {
    e.preventDefault();
    if (!food || !amountOk) return;
    onAdd(food, { amount: Number(amount), meal, time, notes });
    setNotes('');
  };

  return (
    <form className="picker" onSubmit={submit}>
      {!initialFoodId && (
        <>
          <Field label="Search foods">
            <input type="search" placeholder="e.g. rice, gel, banana" value={q} onChange={(e) => setQ(e.target.value)} />
          </Field>
          <div className="picker-list" role="listbox" aria-label="Food results">
            {matches.length === 0 && <div className="muted small pad">No foods match. Add it in Food Database.</div>}
            {matches.map((f) => (
              <button type="button" key={f.id} role="option" aria-selected={f.id === foodId}
                className={`picker-item ${f.id === foodId ? 'on' : ''}`} onClick={() => choose(f)}>
                <span>{f.name}</span>
                <span className="muted small">{fmt(f.carbs, 1)} g carbs / {fmt(f.servingSize)} {f.servingUnit}</span>
              </button>
            ))}
          </div>
        </>
      )}
      {food && (
        <div className="picker-detail">
          <div className="form-grid">
            <Field label={`Amount (${food.servingUnit})`} hint={`1 serving = ${fmt(food.servingSize)} ${food.servingUnit}`} error={amountOk ? null : 'Enter an amount > 0'}>
              <input type="number" inputMode="decimal" step="any" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </Field>
            <Field label="Meal">
              <select value={meal} onChange={(e) => setMeal(e.target.value)}>{MEALS.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}</select>
            </Field>
            <Field label="Time"><input type="time" value={time} onChange={(e) => setTime(e.target.value)} /></Field>
            <Field label="Notes"><input value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
          </div>
          <div className="quick-servings">
            {[0.5, 1, 1.5, 2].map((m) => (
              <button type="button" key={m} className="chip" onClick={() => setAmount(String(Math.round(food.servingSize * m * 10) / 10))}>{m}×</button>
            ))}
          </div>
          {scaled && (
            <p className="small">
              <strong>{fmt(scaled.carbs, 1)} g carbs</strong> · {fmt(scaled.protein, 1)} g protein · {fmt(scaled.fat, 1)} g fat · {fmt(scaled.kcal)} kcal
              {scaled.sodiumMg > 0 && ` · ${fmt(scaled.sodiumMg)} mg Na`}{scaled.fluidMl > 0 && ` · ${fmt(scaled.fluidMl)} ml`}
            </p>
          )}
          <button type="submit" className="btn btn-primary" disabled={!amountOk}>{submitLabel}</button>
        </div>
      )}
    </form>
  );
}
