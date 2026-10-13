import React, { useRef, useState } from 'react';
import { download } from '../components/ui.jsx';
import { exportJSON, parseImport } from '../lib/storage.js';
import { foodLogCSV } from '../lib/csv.js';
import { seedData } from '../lib/seed.js';
import { todayISO } from '../lib/dates.js';

export default function DataPanel({ data, setData, onClose }) {
  const fileRef = useRef(null);
  const [msg, setMsg] = useState(null);

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const imported = parseImport(await file.text());
      const summary = `${imported.athletes.length} athletes, ${imported.foods.length} foods, ${imported.diary.length} diary entries`;
      if (!window.confirm(`Import ${summary}? This replaces ALL current data in this browser. Export a backup first if unsure.`)) return;
      setData(imported);
      setMsg({ ok: true, text: `Imported ${summary}.` });
    } catch (err) {
      setMsg({ ok: false, text: `Import failed — current data was not changed.\n${err.message}` });
    }
  };

  const reset = () => {
    if (window.confirm('Reset to demo data? All athletes, diaries, plans and custom foods in this browser will be replaced.')) {
      setData(seedData());
      setMsg({ ok: true, text: 'Demo data restored.' });
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-label="Data and backup" onClick={(e) => e.stopPropagation()}>
        <header className="card-head"><h2>Data & backup</h2><button className="btn btn-ghost" onClick={onClose} aria-label="Close">✕</button></header>
        <p className="info">All data is stored locally in this browser (localStorage). It is not synchronised to other devices or browsers, and clearing site data will erase it. Export regularly to keep a backup.</p>
        <div className="data-actions">
          <button className="btn btn-primary" onClick={() => download(`race-fueling-backup-${todayISO()}.json`, exportJSON(data))}>Export all data (JSON)</button>
          <button className="btn" onClick={() => fileRef.current?.click()}>Import data (JSON)</button>
          <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={onFile} data-testid="import-file" />
          <button className="btn" onClick={() => download(`food-logs-${todayISO()}.csv`, foodLogCSV(data), 'text/csv')} disabled={data.diary.length === 0}>
            Export food logs (CSV)
          </button>
          <button className="btn btn-danger" onClick={reset}>Reset demo data</button>
        </div>
        {msg && <pre className={msg.ok ? 'ok' : 'field-error'} role="status">{msg.text}</pre>}
        <p className="muted small">Schema version {data.version} · {data.athletes.length} athletes · {data.foods.length} foods · {data.diary.length} diary entries · {data.hydration.length} hydration logs</p>
      </div>
    </div>
  );
}
