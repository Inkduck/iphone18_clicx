import { describe, it, expect } from 'vitest';
import { seedData } from '../src/lib/seed.js';
import * as ops from '../src/lib/ops.js';
import {
  createApi, createTeam, fetchTeam, syncOnce, mergeShared, sharedPart, same,
  generateTeamCode, isPlausibleCode, SyncError,
} from '../src/lib/sync.js';
import { entriesFor, sumEntries } from '../src/lib/calc.js';
import { createFakeSupabase } from './fakeSupabase.js';

const TODAY = '2026-10-13';
const setup = () => {
  const fake = createFakeSupabase();
  const api = createApi({ url: 'https://x.supabase.co/', key: 'anon-key', fetchImpl: fake.fetchImpl });
  return { fake, api };
};
const rice = (d) => d.foods.find((f) => f.name.startsWith('Cooked white rice'));
const carbs = (d, aid) => sumEntries(entriesFor(d, aid, TODAY)).carbs;

/** Simulated device: local data + sync meta, like the app keeps in localStorage. */
function device(api, code, meta, data) {
  const dev = { data, meta };
  dev.sync = async () => {
    const r = await syncOnce({ api, code, meta: dev.meta, local: sharedPart(dev.data) });
    dev.meta = r.meta;
    if (r.apply) dev.data = { ...dev.data, ...r.apply };
  };
  return dev;
}

describe('team codes', () => {
  it('are long, random and readable', () => {
    const a = generateTeamCode();
    expect(a).toMatch(/^RFT-([A-Z2-9]{5}-){3}[A-Z2-9]{5}$/);
    expect(a).not.toBe(generateTeamCode());
    expect(isPlausibleCode(a)).toBe(true);
    expect(isPlausibleCode('abc')).toBe(false);
  });
});

describe('merge', () => {
  it('keeps both devices\' new records', () => {
    const base = sharedPart(seedData(TODAY));
    const a = { ...base, diary: [{ id: 'a1', athleteId: 'x', date: TODAY }] };
    const b = { ...base, diary: [{ id: 'b1', athleteId: 'y', date: TODAY }] };
    expect(mergeShared(base, a, b).diary.map((e) => e.id).sort()).toEqual(['a1', 'b1']);
  });
  it('respects deletions on either side', () => {
    const base = { ...sharedPart(seedData(TODAY)), diary: [{ id: 'e1' }, { id: 'e2' }] };
    const local = { ...base, diary: [{ id: 'e2' }] }; // deleted e1 locally
    const remote = { ...base, diary: [{ id: 'e1' }] }; // deleted e2 remotely
    expect(mergeShared(base, local, remote).diary).toEqual([]);
  });
  it('merges nested day plans per date', () => {
    const base = sharedPart(seedData(TODAY));
    const local = { ...base, dayPlans: { a: { '2026-10-13': { phase: 'd1', gPerKg: 8 } } } };
    const remote = { ...base, dayPlans: { a: { '2026-10-14': { phase: 'race', gPerKg: '' } } } };
    expect(Object.keys(mergeShared(base, local, remote).dayPlans.a).sort()).toEqual(['2026-10-13', '2026-10-14']);
  });
});

describe('sync round trips', () => {
  it('create team → join on another device → changes flow both ways', async () => {
    const { api } = setup();
    const d1data = seedData(TODAY);
    const { code, meta } = await createTeam({ api, local: sharedPart(d1data) });
    const A = device(api, code, meta, d1data);

    const remote = await fetchTeam({ api, code });
    const B = device(api, code, { version: remote.version, base: remote.data }, { ...seedData(TODAY), ...remote.data });
    const ath = A.data.athletes[0].id;

    A.data = ops.addEntry(A.data, ops.makeEntry(rice(A.data), { athleteId: ath, date: TODAY, meal: 'lunch', amount: 150 }));
    await A.sync();
    await B.sync();
    expect(carbs(B.data, ath)).toBe(42);

    const eid = B.data.diary[0].id;
    B.data = ops.updateEntry(B.data, eid, { amount: 300 });
    await B.sync();
    await A.sync();
    expect(carbs(A.data, ath)).toBe(84);
  });

  it('concurrent edits on two devices are both kept', async () => {
    const { api } = setup();
    const start = seedData(TODAY);
    const { code, meta } = await createTeam({ api, local: sharedPart(start) });
    const A = device(api, code, meta, structuredClone(start));
    const B = device(api, code, meta, structuredClone(start));
    const [a1, a2] = start.athletes.map((a) => a.id);

    A.data = ops.addEntry(A.data, ops.makeEntry(rice(A.data), { athleteId: a1, date: TODAY, meal: 'lunch', amount: 150 }));
    B.data = ops.addEntry(B.data, ops.makeEntry(rice(B.data), { athleteId: a2, date: TODAY, meal: 'dinner', amount: 450 }));
    B.data = ops.updateAthlete(B.data, a2, { notes: 'edited on B' }, TODAY);

    await A.sync(); // pushes v2
    await B.sync(); // conflict → merge → pushes v3
    await A.sync(); // pulls v3
    for (const dev of [A, B]) {
      expect(carbs(dev.data, a1)).toBe(42);
      expect(carbs(dev.data, a2)).toBe(126);
      expect(dev.data.athletes.find((a) => a.id === a2).notes).toBe('edited on B');
    }
    expect(same(sharedPart(A.data), sharedPart(B.data))).toBe(true);
  });

  it('save race between read and write retries with a merge', async () => {
    const { api } = setup();
    const start = seedData(TODAY);
    const { code, meta } = await createTeam({ api, local: sharedPart(start) });
    const a1 = start.athletes[0].id;
    // Another device saves right after our read.
    let injected = false;
    const racingApi = {
      get: (c) => api.get(c),
      save: async (c, d, v) => {
        if (!injected) {
          injected = true;
          const other = ops.addEntry(start, ops.makeEntry(rice(start), { athleteId: a1, date: TODAY, meal: 'other', amount: 150 }));
          await api.save(c, sharedPart(other), 1);
        }
        return api.save(c, d, v);
      },
    };
    const mine = ops.addEntry(start, ops.makeEntry(rice(start), { athleteId: a1, date: TODAY, meal: 'lunch', amount: 300 }));
    const r = await syncOnce({ api: racingApi, code, meta, local: sharedPart(mine) });
    expect(r.meta.version).toBe(3);
    const server = await api.get(code);
    expect(server.data.diary).toHaveLength(2);
    expect(r.apply.diary).toHaveLength(2);
  });

  it('nothing to do when unchanged', async () => {
    const { api } = setup();
    const start = sharedPart(seedData(TODAY));
    const { code, meta } = await createTeam({ api, local: start });
    const r = await syncOnce({ api, code, meta, local: start });
    expect(r).toEqual({ meta, apply: null });
  });

  it('reports offline, unknown team and bad key distinctly', async () => {
    const { api, fake } = setup();
    await expect(fetchTeam({ api, code: generateTeamCode() })).rejects.toMatchObject({ kind: 'notfound' });
    fake.setOffline(true);
    await expect(fetchTeam({ api, code: generateTeamCode() })).rejects.toMatchObject({ kind: 'offline' });
    const bad = createApi({ url: 'https://x.supabase.co', key: 'wrong', fetchImpl: createFakeSupabase().fetchImpl });
    await expect(bad.get(generateTeamCode())).rejects.toMatchObject({ kind: 'server' });
    expect(() => createApi({ url: '', key: '' })).toThrow(SyncError);
  });

  it('stores only a hash of the team code', async () => {
    const { api, fake } = setup();
    const { code } = await createTeam({ api, local: sharedPart(seedData(TODAY)) });
    const [key] = fake.rows.keys();
    expect(key).toMatch(/^[0-9a-f]{64}$/);
    expect(key).not.toContain(code);
    expect(sharedPart(seedData(TODAY))).not.toHaveProperty('preferences');
  });
});

describe('auth headers', () => {
  const capture = () => {
    const seen = [];
    return { seen, fetchImpl: async (url, init) => { seen.push(init.headers); return { ok: true, json: async () => [] }; } };
  };
  it('publishable keys go only in apikey', async () => {
    const c = capture();
    await createApi({ url: 'https://x.supabase.co', key: 'sb_publishable_abc', fetchImpl: c.fetchImpl }).get(generateTeamCode());
    expect(c.seen[0]).toEqual({ apikey: 'sb_publishable_abc', 'Content-Type': 'application/json' });
  });
  it('legacy JWT anon keys are also sent as Bearer', async () => {
    const c = capture();
    await createApi({ url: 'https://x.supabase.co', key: 'eyJhbGciOi.x.y', fetchImpl: c.fetchImpl }).get(generateTeamCode());
    expect(c.seen[0].Authorization).toBe('Bearer eyJhbGciOi.x.y');
  });
});
