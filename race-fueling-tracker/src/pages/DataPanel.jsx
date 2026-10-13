import React, { useRef, useState } from 'react';
import { download } from '../components/ui.jsx';
import { exportJSON, parseImport } from '../lib/storage.js';
import { foodLogCSV } from '../lib/csv.js';
import { seedData } from '../lib/seed.js';
import { todayISO } from '../lib/dates.js';
import { isPlausibleCode } from '../lib/sync.js';

function TeamSync({ sync, initialJoinCode }) {
  const [code, setCode] = useState(initialJoinCode || '');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [show, setShow] = useState(false);

  const run = async (fn) => {
    setBusy(true);
    setMsg(null);
    try { await fn(); } catch (err) { setMsg({ ok: false, text: err.message }); } finally { setBusy(false); }
  };
  const copy = async (text, label) => {
    try { await navigator.clipboard.writeText(text); setMsg({ ok: true, text: `${label} copied.` }); }
    catch { setMsg({ ok: false, text: 'Copy failed — select and copy it manually.' }); }
  };

  if (!sync.configured) {
    return (
      <section className="sync-box">
        <h3>Team sync</h3>
        <p className="muted small">Team sync isn't set up in this build yet (Supabase URL and anon key missing). The app works locally in the meantime.</p>
      </section>
    );
  }

  if (sync.meta) {
    const link = `${window.location.origin}${window.location.pathname}#team=${sync.meta.code}`;
    const st = sync.status;
    return (
      <section className="sync-box">
        <h3>Team sync <span className={`sync-pill sync-${st.state}`}><span className="sync-dot" aria-hidden />{st.state}</span></h3>
        <p className="small">
          Connected. Changes sync automatically with everyone using this team code.
          {st.at && <span className="muted"> Last synced {st.at.toLocaleTimeString()}.</span>}
        </p>
        {st.message && st.state !== 'synced' && <p className="warn">{st.message}</p>}
        <div className="code-row">
          <code data-testid="team-code">{show ? sync.meta.code : `${sync.meta.code.slice(0, 4)}•••••-•••••-•••••-${sync.meta.code.slice(-5)}`}</code>
          <button className="btn btn-small" onClick={() => setShow((v) => !v)}>{show ? 'Hide' : 'Show'}</button>
        </div>
        <div className="data-actions">
          <button className="btn" onClick={() => copy(sync.meta.code, 'Team code')}>Copy team code</button>
          <button className="btn" onClick={() => copy(link, 'Join link')}>Copy join link</button>
          <button className="btn" onClick={sync.syncNow} disabled={st.state === 'syncing'}>Sync now</button>
          <button className="btn btn-danger" onClick={() => window.confirm('Stop syncing on this browser? A local copy of the data stays here; the team data is not deleted.') && sync.leave()}>Leave team on this browser</button>
        </div>
        <p className="muted small">Share the code only with your team — anyone who has it can view and edit all athletes' data.</p>
        {msg && <p className={msg.ok ? 'ok small' : 'field-error'} role="status">{msg.text}</p>}
      </section>
    );
  }

  return (
    <section className="sync-box">
      <h3>Team sync</h3>
      <p className="small">Sync athletes, diaries and race plans across browsers and phones through Supabase. Access is protected by a team code.</p>
      <div className="data-actions">
        <button className="btn btn-primary" disabled={busy} onClick={() => run(async () => {
          if (!window.confirm('Create a new team and upload the data in this browser?')) return;
          await sync.create();
          setMsg({ ok: true, text: 'Team created. Copy the team code or join link and share it with your athletes.' });
        })}>Create team from this browser's data</button>
      </div>
      <form className="join-form" onSubmit={(e) => { e.preventDefault(); run(async () => {
        if (!isPlausibleCode(code)) throw new Error('Enter the full team code, e.g. RFT-XXXXX-XXXXX-XXXXX-XXXXX.');
        if (!window.confirm("Join this team? This browser's current data will be replaced by the team's data. Export a backup first if you need it.")) return;
        await sync.join(code);
        setMsg({ ok: true, text: 'Joined. Data is now synced with the team.' });
      }); }}>
        <label className="field">
          <span className="field-label">Join an existing team</span>
          <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="RFT-XXXXX-XXXXX-XXXXX-XXXXX" autoCapitalize="characters" autoComplete="off" spellCheck={false} />
        </label>
        <button className="btn" type="submit" disabled={busy}>Join team</button>
      </form>
      {msg && <p className={msg.ok ? 'ok small' : 'field-error'} role="status">{msg.text}</p>}
    </section>
  );
}

export default function DataPanel({ data, setData, sync, initialJoinCode, onClose }) {
  const teamNote = sync?.meta ? ' Team sync is on, so this also changes the data for everyone on the team.' : '';
  const fileRef = useRef(null);
  const [msg, setMsg] = useState(null);

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const imported = parseImport(await file.text());
      const summary = `${imported.athletes.length} athletes, ${imported.foods.length} foods, ${imported.diary.length} diary entries`;
      if (!window.confirm(`Import ${summary}? This replaces ALL current data in this browser.${teamNote} Export a backup first if unsure.`)) return;
      setData(imported);
      setMsg({ ok: true, text: `Imported ${summary}.` });
    } catch (err) {
      setMsg({ ok: false, text: `Import failed — current data was not changed.\n${err.message}` });
    }
  };

  const reset = () => {
    if (window.confirm(`Reset to demo data? All athletes, diaries, plans and custom foods in this browser will be replaced.${teamNote}`)) {
      setData(seedData());
      setMsg({ ok: true, text: 'Demo data restored.' });
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-label="Data and backup" onClick={(e) => e.stopPropagation()}>
        <header className="card-head"><h2>Data & backup</h2><button className="btn btn-ghost" onClick={onClose} aria-label="Close">✕</button></header>
        <TeamSync sync={sync} initialJoinCode={initialJoinCode} />
        <p className="info">{sync?.meta
          ? 'Data is kept in this browser and synced with the team through Supabase. Export occasionally to keep an offline backup.'
          : 'All data is stored locally in this browser (localStorage). It is not synchronised to other devices or browsers, and clearing site data will erase it. Export regularly to keep a backup.'}</p>
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
