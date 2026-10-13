// Supabase connection for team sync. The anon key is designed to be public;
// the database only exposes the team-code-protected rft_get / rft_save functions.
// Values can also come from VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY at build time.
// Same Supabase project as the queue-ticket page (see ../../index.html); tables/functions are prefixed rft_.
export const SUPABASE_URL = import.meta.env?.VITE_SUPABASE_URL || 'https://jdtbuezvhsgctpwveqqi.supabase.co';
export const SUPABASE_ANON_KEY = import.meta.env?.VITE_SUPABASE_ANON_KEY || 'sb_publishable_9ginfCTUGRWtbWWzqLqN-Q_TGKhYqhm';
export const syncConfigured = () => Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
