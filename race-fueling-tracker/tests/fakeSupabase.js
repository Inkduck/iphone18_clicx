// In-memory stand-in for the rft_get / rft_save SQL functions (same semantics as supabase/schema.sql).
import { createHash } from 'node:crypto';

export function createFakeSupabase() {
  const rows = new Map();
  const hash = (c) => createHash('sha256').update(String(c).trim().toUpperCase()).digest('hex');
  let offline = false;
  const fetchImpl = async (url, init) => {
    if (offline) throw new TypeError('Failed to fetch');
    const fn = url.split('/rpc/')[1];
    const body = JSON.parse(init.body);
    const json = (status, v) => ({ ok: status < 400, status, json: async () => v });
    if (init.headers.apikey !== 'anon-key') return json(401, { message: 'Invalid API key' });
    if (fn === 'rft_get') {
      const r = rows.get(hash(body.p_code));
      return json(200, r ? [{ data: structuredClone(r.data), version: r.version, updated_at: 'now' }] : []);
    }
    if (fn === 'rft_save') {
      if (String(body.p_code).trim().length < 16) return json(400, { message: 'team code too short' });
      const h = hash(body.p_code);
      const cur = rows.get(h);
      if (!cur) {
        if (body.p_expected_version !== 0) return json(200, [{ ok: false, version: 0 }]);
        rows.set(h, { data: structuredClone(body.p_data), version: 1 });
        return json(200, [{ ok: true, version: 1 }]);
      }
      if (cur.version !== body.p_expected_version) return json(200, [{ ok: false, version: cur.version }]);
      rows.set(h, { data: structuredClone(body.p_data), version: cur.version + 1 });
      return json(200, [{ ok: true, version: cur.version + 1 }]);
    }
    return json(404, { message: 'no such function' });
  };
  return { fetchImpl, rows, setOffline: (v) => { offline = v; } };
}
