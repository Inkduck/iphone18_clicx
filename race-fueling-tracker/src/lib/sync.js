// Team sync with Supabase. Local-first: localStorage stays the source the UI reads;
// this module pulls/pushes the shared part of the data and merges per record.
import { SCHEMA_VERSION } from './storage.js';

export const SYNC_KEY = 'race-fueling-tracker-sync';

// Everything except per-device preferences is shared with the team.
const COLLECTIONS = {
  athletes: 'array',
  foods: 'array',
  diary: 'array',
  hydration: 'array',
  racePlans: 'map',
  hydrationTargets: 'map',
  dayPlans: 'nested',
};

export function sharedPart(data) {
  const out = { version: SCHEMA_VERSION };
  for (const k of Object.keys(COLLECTIONS)) out[k] = data?.[k] ?? (COLLECTIONS[k] === 'array' ? [] : {});
  return out;
}

export const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

function toMap(kind, v) {
  if (kind === 'array') return new Map((Array.isArray(v) ? v : []).map((r) => [r.id, r]));
  if (kind === 'map') return new Map(Object.entries(v ?? {}));
  const m = new Map(); // nested: { athleteId: { date: plan } } -> "athleteId|date"
  for (const [a, days] of Object.entries(v ?? {})) for (const [d, p] of Object.entries(days ?? {})) m.set(`${a}|${d}`, p);
  return m;
}

function fromMap(kind, m) {
  if (kind === 'array') return [...m.values()];
  if (kind === 'map') return Object.fromEntries(m);
  const out = {};
  for (const [k, p] of m) {
    const i = k.indexOf('|');
    const a = k.slice(0, i);
    (out[a] ??= {})[k.slice(i + 1)] = p;
  }
  return out;
}

/**
 * Three-way merge per record. A record this device changed (added, edited or
 * deleted) since `base` keeps the local version; everything else follows `remote`.
 * Two devices editing the very same record: this device's version wins.
 */
export function mergeShared(base, local, remote) {
  const out = { version: SCHEMA_VERSION };
  for (const [k, kind] of Object.entries(COLLECTIONS)) {
    const b = toMap(kind, base?.[k]);
    const l = toMap(kind, local?.[k]);
    const r = toMap(kind, remote?.[k]);
    const merged = new Map();
    const keys = [...new Set([...r.keys(), ...l.keys()])];
    for (const key of keys) {
      const lv = l.get(key);
      const v = same(lv, b.get(key)) ? r.get(key) : lv;
      if (v !== undefined) merged.set(key, v);
    }
    out[k] = fromMap(kind, merged);
  }
  return out;
}

// ---- Team codes ----
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I

export function generateTeamCode() {
  const bytes = new Uint8Array(20);
  crypto.getRandomValues(bytes);
  const chars = [...bytes].map((b) => ALPHABET[b % 32]).join('');
  return `RFT-${chars.match(/.{5}/g).join('-')}`; // 100 bits of randomness
}

export const normalizeCode = (c) => String(c ?? '').trim().toUpperCase();
export const isPlausibleCode = (c) => normalizeCode(c).replace(/[^A-Z0-9]/g, '').length >= 16;

// ---- Supabase REST (PostgREST RPC) client ----
export class SyncError extends Error {
  constructor(kind, message) {
    super(message ?? kind);
    this.kind = kind; // 'offline' | 'notfound' | 'conflict' | 'server' | 'config'
  }
}

export function createApi({ url, key, fetchImpl = (...a) => globalThis.fetch(...a) }) {
  if (!url || !key) throw new SyncError('config', 'Supabase is not configured.');
  const base = url.replace(/\/+$/, '');
  const call = async (fn, body) => {
    let res;
    try {
      res = await fetchImpl(`${base}/rest/v1/rpc/${fn}`, {
        method: 'POST',
        headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    } catch (err) {
      throw new SyncError('offline', 'Cannot reach Supabase (offline?).');
    }
    if (!res.ok) {
      let msg = `${res.status}`;
      try { msg = (await res.json()).message ?? msg; } catch { /* ignore */ }
      throw new SyncError('server', `Supabase error: ${msg}`);
    }
    return res.json();
  };
  return {
    async get(code) {
      const rows = await call('rft_get', { p_code: normalizeCode(code) });
      const r = Array.isArray(rows) ? rows[0] : null;
      return r ? { data: r.data, version: Number(r.version) } : null;
    },
    async save(code, data, expectedVersion) {
      const rows = await call('rft_save', { p_code: normalizeCode(code), p_data: data, p_expected_version: expectedVersion });
      const r = Array.isArray(rows) ? rows[0] : rows;
      return { ok: !!r?.ok, version: Number(r?.version) };
    },
  };
}

/**
 * One sync round. `meta` = { version, base } from the last successful sync.
 * Returns the new meta and, when the remote had changes, the shared data to apply locally.
 */
export async function syncOnce({ api, code, meta, local, maxAttempts = 4 }) {
  let apply = null;
  let current = local;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const remote = await api.get(code);
    if (!remote) throw new SyncError('notfound', 'Team not found. Check the team code.');
    let payload;
    if (remote.version === meta.version) {
      if (same(current, meta.base)) return { meta, apply };
      payload = current;
    } else {
      payload = same(current, meta.base) ? remote.data : mergeShared(meta.base, current, remote.data);
      apply = payload;
      if (same(payload, remote.data)) return { meta: { version: remote.version, base: remote.data }, apply };
    }
    const res = await api.save(code, payload, remote.version);
    if (res.ok) return { meta: { version: res.version, base: payload }, apply };
    // Someone saved in between: merge again against the newer remote, keeping our changes.
    meta = { version: remote.version, base: remote.data };
    current = payload;
  }
  throw new SyncError('conflict', 'Too many simultaneous edits — will retry shortly.');
}

export async function createTeam({ api, local }) {
  for (let i = 0; i < 3; i++) {
    const code = generateTeamCode();
    const res = await api.save(code, local, 0);
    if (res.ok) return { code, meta: { version: res.version, base: local } };
  }
  throw new SyncError('server', 'Could not create a team. Try again.');
}

export async function fetchTeam({ api, code }) {
  const remote = await api.get(code);
  if (!remote) throw new SyncError('notfound', 'Team not found. Check the team code.');
  return remote;
}

// ---- Persisted sync settings (per device) ----
export function loadSyncMeta(storage = globalThis.localStorage) {
  try {
    const v = JSON.parse(storage?.getItem(SYNC_KEY) ?? 'null');
    if (v && typeof v.code === 'string') return { code: v.code, version: Number(v.version) || 0, base: v.base ?? null };
  } catch { /* ignore */ }
  return null;
}

export function saveSyncMeta(meta, storage = globalThis.localStorage) {
  try {
    if (meta) storage?.setItem(SYNC_KEY, JSON.stringify(meta));
    else storage?.removeItem(SYNC_KEY);
  } catch { /* ignore quota errors; next sync re-pulls */ }
}
