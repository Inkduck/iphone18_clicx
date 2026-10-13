// Date helpers. All app dates are local calendar dates stored as "YYYY-MM-DD".

const pad = (n) => String(n).padStart(2, '0');

export function toISODate(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function todayISO() {
  return toISODate(new Date());
}

export function isValidISODate(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = parseISODate(s);
  return toISODate(d) === s;
}

export function parseISODate(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(iso, n) {
  const d = parseISODate(iso);
  d.setDate(d.getDate() + n);
  return toISODate(d);
}

/** Whole calendar days from `from` to `to` (positive when `to` is later). */
export function daysBetween(from, to) {
  const a = parseISODate(from);
  const b = parseISODate(to);
  return Math.round((Date.UTC(b.getFullYear(), b.getMonth(), b.getDate()) -
    Date.UTC(a.getFullYear(), a.getMonth(), a.getDate())) / 86400000);
}

export function formatDate(iso, opts = { weekday: 'short', day: 'numeric', month: 'short' }) {
  if (!isValidISODate(iso)) return '—';
  return parseISODate(iso).toLocaleDateString(undefined, opts);
}

/** Parse "H:MM", "HH:MM" or "H:MM:SS" into minutes. Returns null when invalid. */
export function parseDuration(str) {
  if (typeof str !== 'string') return null;
  const m = str.trim().match(/^(\d{1,2}):([0-5]\d)(?::([0-5]\d))?$/);
  if (!m) return null;
  const mins = Number(m[1]) * 60 + Number(m[2]) + (m[3] ? Number(m[3]) / 60 : 0);
  return mins > 0 ? mins : null;
}

export function formatDuration(mins) {
  if (mins == null || !Number.isFinite(mins)) return '—';
  const total = Math.round(mins);
  const h = Math.floor(total / 60);
  return `${h}:${pad(total % 60)}`;
}

/** Parse a "HH:MM" clock time into minutes after midnight, or null. */
export function parseClock(str) {
  if (typeof str !== 'string') return null;
  const m = str.trim().match(/^([01]?\d|2[0-3]):([0-5]\d)$/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

export function clockPlus(startClock, elapsedMin) {
  const start = parseClock(startClock);
  if (start == null || !Number.isFinite(elapsedMin)) return null;
  const t = Math.round(start + elapsedMin) % 1440;
  return `${pad(Math.floor(t / 60))}:${pad(t % 60)}`;
}
