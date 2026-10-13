import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  createApi, createTeam, fetchTeam, syncOnce, mergeShared, sharedPart, same,
  loadSyncMeta, saveSyncMeta, normalizeCode,
} from './lib/sync.js';
import { normalizeData } from './lib/storage.js';
import { SUPABASE_URL, SUPABASE_ANON_KEY, syncConfigured } from './lib/supabaseConfig.js';

const PUSH_DELAY_MS = 1500;
const POLL_MS = 20000;

/** Background team sync: pushes local edits shortly after they happen and polls for teammates' edits. */
export function useTeamSync(data, setData) {
  const api = useMemo(() => (syncConfigured() ? createApi({ url: SUPABASE_URL, key: SUPABASE_ANON_KEY }) : null), []);
  const [meta, setMetaState] = useState(() => loadSyncMeta());
  const [status, setStatus] = useState({ state: meta ? 'idle' : 'off', message: '', at: null });
  const dataRef = useRef(data);
  const metaRef = useRef(meta);
  const busy = useRef(false);
  const again = useRef(false);
  dataRef.current = data;

  const setMeta = useCallback((m) => {
    metaRef.current = m;
    saveSyncMeta(m);
    setMetaState(m);
  }, []);

  // Apply incoming shared data without losing edits made while the request was in flight.
  const applyShared = useCallback((snapshot, incoming) => {
    setData((cur) => {
      const curShared = sharedPart(cur);
      const next = same(curShared, snapshot) ? incoming : mergeShared(snapshot, curShared, incoming);
      return normalizeData({ ...next, preferences: cur.preferences });
    });
  }, [setData]);

  const syncNow = useCallback(async () => {
    const m = metaRef.current;
    if (!api || !m) return;
    if (busy.current) { again.current = true; return; }
    busy.current = true;
    setStatus((s) => ({ ...s, state: 'syncing' }));
    const snapshot = sharedPart(dataRef.current);
    try {
      const r = await syncOnce({ api, code: m.code, meta: { version: m.version, base: m.base }, local: snapshot });
      if (metaRef.current?.code !== m.code) return; // left the team meanwhile
      setMeta({ code: m.code, ...r.meta });
      if (r.apply) applyShared(snapshot, r.apply);
      setStatus({ state: 'synced', message: '', at: new Date() });
    } catch (err) {
      setStatus((s) => ({ state: err.kind === 'offline' ? 'offline' : 'error', message: err.message, at: s.at }));
    } finally {
      busy.current = false;
      if (again.current) { again.current = false; setTimeout(syncNow, 0); }
    }
  }, [api, applyShared, setMeta]);

  // Push soon after local edits.
  useEffect(() => {
    if (!api || !meta || same(sharedPart(data), meta.base)) return undefined;
    setStatus((s) => (s.state === 'synced' ? { ...s, state: 'pending' } : s));
    const t = setTimeout(syncNow, PUSH_DELAY_MS);
    return () => clearTimeout(t);
  }, [api, data, meta, syncNow]);

  // Pull on start, on an interval while visible, and when coming back online / to the tab.
  useEffect(() => {
    if (!api || !meta?.code) return undefined;
    syncNow();
    const tick = () => { if (document.visibilityState === 'visible') syncNow(); };
    const id = setInterval(tick, POLL_MS);
    window.addEventListener('online', syncNow);
    window.addEventListener('focus', tick);
    document.addEventListener('visibilitychange', tick);
    return () => {
      clearInterval(id);
      window.removeEventListener('online', syncNow);
      window.removeEventListener('focus', tick);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [api, meta?.code, syncNow]);

  const create = useCallback(async () => {
    const local = sharedPart(dataRef.current);
    const { code, meta: m } = await createTeam({ api, local });
    setMeta({ code, ...m });
    setStatus({ state: 'synced', message: '', at: new Date() });
    return code;
  }, [api, setMeta]);

  const join = useCallback(async (rawCode) => {
    const code = normalizeCode(rawCode);
    const remote = await fetchTeam({ api, code });
    setData((cur) => normalizeData({ ...remote.data, preferences: cur.preferences }));
    setMeta({ code, version: remote.version, base: remote.data });
    setStatus({ state: 'synced', message: '', at: new Date() });
  }, [api, setData, setMeta]);

  const leave = useCallback(() => {
    setMeta(null);
    setStatus({ state: 'off', message: '', at: null });
  }, [setMeta]);

  return { configured: !!api, meta, status, syncNow, create, join, leave };
}
