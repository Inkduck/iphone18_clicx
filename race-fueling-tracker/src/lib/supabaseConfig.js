// Supabase connection for team sync. The anon key is designed to be public;
// the database only exposes the team-code-protected rft_get / rft_save functions.
// Values can also come from VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY at build time.
export const SUPABASE_URL = import.meta.env?.VITE_SUPABASE_URL || '';
export const SUPABASE_ANON_KEY = import.meta.env?.VITE_SUPABASE_ANON_KEY || '';
export const syncConfigured = () => Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
