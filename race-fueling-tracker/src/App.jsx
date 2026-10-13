import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { loadData, saveData } from './lib/storage.js';
import { todayISO } from './lib/dates.js';
import Dashboard from './pages/Dashboard.jsx';
import Athletes from './pages/Athletes.jsx';
import CarbLoading from './pages/CarbLoading.jsx';
import FoodDiary from './pages/FoodDiary.jsx';
import RaceDay from './pages/RaceDay.jsx';
import FoodDatabase from './pages/FoodDatabase.jsx';
import DataPanel from './pages/DataPanel.jsx';
import { useTeamSync } from './useTeamSync.js';

const SYNC_LABEL = { off: '', idle: 'Team sync', pending: 'Saving…', syncing: 'Syncing…', synced: 'Synced', offline: 'Offline', error: 'Sync issue' };

const NAV = [
  { key: 'dashboard', label: 'Dashboard', icon: '◧' },
  { key: 'athletes', label: 'Athletes', icon: '◉' },
  { key: 'carbs', label: 'Carb Loading', short: 'Carbs', icon: '▲' },
  { key: 'diary', label: 'Food Diary', short: 'Diary', icon: '☰' },
  { key: 'race', label: 'Race Day', icon: '⚑' },
  { key: 'foods', label: 'Food Database', short: 'Foods', icon: '▦' },
];

export default function App() {
  const [data, setData] = useState(() => loadData());
  const [saveError, setSaveError] = useState('');
  const [showData, setShowData] = useState(false);
  const [diaryDate, setDiaryDate] = useState(todayISO);
  const [joinCode, setJoinCode] = useState('');
  const today = todayISO();
  const sync = useTeamSync(data, setData);

  // Shared join link: #team=CODE opens the Data panel with the code filled in.
  useEffect(() => {
    const m = window.location.hash.match(/team=([A-Za-z0-9-]+)/);
    if (!m) return;
    history.replaceState(null, '', window.location.pathname + window.location.search);
    if (sync.meta?.code !== m[1].toUpperCase()) {
      setJoinCode(m[1]);
      setShowData(true);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    try {
      saveData(data);
      setSaveError('');
    } catch (err) {
      setSaveError(`Could not save to browser storage: ${err.message}`);
    }
  }, [data]);

  const update = useCallback((fn) => setData((d) => fn(d)), []);
  const page = NAV.some((n) => n.key === data.preferences.page) ? data.preferences.page : 'dashboard';
  const go = useCallback((p) => {
    setData((d) => ({ ...d, preferences: { ...d.preferences, page: p } }));
    window.scrollTo({ top: 0 });
  }, []);
  const selectAthlete = useCallback((id) => setData((d) => ({ ...d, preferences: { ...d.preferences, selectedAthleteId: id } })), []);

  const athlete = useMemo(
    () => data.athletes.find((a) => a.id === data.preferences.selectedAthleteId) ?? data.athletes[0] ?? null,
    [data.athletes, data.preferences.selectedAthleteId],
  );

  const props = { data, update, athlete, today, go, selectAthlete, diaryDate, setDiaryDate };
  const needsAthlete = page !== 'athletes' && page !== 'foods' && !athlete;

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">⚡</span>
          <span className="brand-name">Race Fueling Tracker</span>
        </div>
        <div className="topbar-controls">
          {data.athletes.length > 0 && (
            <select aria-label="Selected athlete" className="athlete-select" value={athlete?.id ?? ''} onChange={(e) => selectAthlete(e.target.value)}>
              {data.athletes.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          )}
          {sync.meta && (
            <button className={`sync-pill sync-${sync.status.state}`} onClick={() => setShowData(true)} title={sync.status.message || 'Team sync status'}>
              <span className="sync-dot" aria-hidden />{SYNC_LABEL[sync.status.state]}
            </button>
          )}
          <button className="btn btn-ghost" onClick={() => setShowData(true)} title="Team sync, backup, import & reset">Data</button>
        </div>
        <nav className="nav">
          {NAV.map((n) => (
            <button key={n.key} className={`nav-item ${page === n.key ? 'active' : ''}`} onClick={() => go(n.key)}>
              <span className="nav-icon" aria-hidden>{n.icon}</span>
              <span className="nav-label nav-long">{n.label}</span>
              <span className="nav-label nav-short">{n.short ?? n.label}</span>
            </button>
          ))}
        </nav>
      </header>

      <main className="main">
        {saveError && <div className="banner banner-error">{saveError}</div>}
        {needsAthlete ? (
          <div className="card">
            <h2>No athletes yet</h2>
            <p>Add an athlete profile to start planning.</p>
            <button className="btn btn-primary" onClick={() => go('athletes')}>Go to Athletes</button>
          </div>
        ) : (
          <>
            {page === 'dashboard' && <Dashboard {...props} />}
            {page === 'athletes' && <Athletes {...props} />}
            {page === 'carbs' && <CarbLoading {...props} />}
            {page === 'diary' && <FoodDiary {...props} />}
            {page === 'race' && <RaceDay {...props} />}
            {page === 'foods' && <FoodDatabase {...props} />}
          </>
        )}
        <footer className="local-note">
          {sync.meta
            ? <>Data is saved in this browser and synced with your team through Supabase. Anyone with the team code can view and edit it. </>
            : <>Data is stored locally in this browser only and is not synchronised to other devices. Set up <button className="link" onClick={() => setShowData(true)}>team sync</button> or use Data → Export to back up. </>}
          Nutrition values and suggestions are estimates and general guidance, not medical advice.
        </footer>
      </main>

      {showData && <DataPanel data={data} setData={setData} sync={sync} initialJoinCode={joinCode} onClose={() => { setShowData(false); setJoinCode(''); }} />}
    </div>
  );
}
