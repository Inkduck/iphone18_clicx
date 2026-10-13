-- Race Fueling Tracker — team sync schema.
-- Run once in Supabase: SQL Editor > New query > paste > Run.
--
-- Access model: the table is NOT readable or writable by the anon key.
-- Clients can only call rft_get / rft_save, which require the team code.
-- Only a SHA-256 hash of the code is stored.

create table if not exists public.rft_teams (
  code_hash  text primary key,
  data       jsonb not null,
  version    bigint not null default 1,
  updated_at timestamptz not null default now()
);

alter table public.rft_teams enable row level security;
-- No RLS policies on purpose: direct table access is denied for anon/authenticated.
revoke all on public.rft_teams from anon, authenticated;

create or replace function public.rft_hash(p_code text)
returns text language sql immutable as $$
  select encode(sha256(convert_to(upper(trim(p_code)), 'UTF8')), 'hex');
$$;

-- Read a team's data. Returns no rows when the code is unknown.
create or replace function public.rft_get(p_code text)
returns table (data jsonb, version bigint, updated_at timestamptz)
language sql stable security definer set search_path = public as $$
  select t.data, t.version, t.updated_at
  from public.rft_teams t
  where t.code_hash = public.rft_hash(p_code);
$$;

-- Save with optimistic concurrency.
--   p_expected_version = 0  -> create a new team (fails if it exists)
--   otherwise               -> update only if the stored version matches
-- On conflict returns ok=false with the current version so the client can merge and retry.
create or replace function public.rft_save(p_code text, p_data jsonb, p_expected_version bigint)
returns table (ok boolean, version bigint)
language plpgsql security definer set search_path = public as $$
declare
  h   text := public.rft_hash(p_code);
  cur bigint;
begin
  if p_code is null or length(trim(p_code)) < 16 then
    raise exception 'team code too short';
  end if;
  if p_data is null or jsonb_typeof(p_data) <> 'object' then
    raise exception 'data must be a JSON object';
  end if;
  if pg_column_size(p_data) > 5 * 1024 * 1024 then
    raise exception 'data too large';
  end if;

  select t.version into cur from public.rft_teams t where t.code_hash = h for update;

  if not found then
    if p_expected_version <> 0 then
      return query select false, 0::bigint;
      return;
    end if;
    insert into public.rft_teams (code_hash, data, version) values (h, p_data, 1);
    return query select true, 1::bigint;
    return;
  end if;

  if cur <> p_expected_version then
    return query select false, cur;
    return;
  end if;

  update public.rft_teams
     set data = p_data, version = cur + 1, updated_at = now()
   where code_hash = h;
  return query select true, cur + 1;
end;
$$;

revoke all on function public.rft_get(text) from public;
revoke all on function public.rft_save(text, jsonb, bigint) from public;
grant execute on function public.rft_get(text) to anon, authenticated;
grant execute on function public.rft_save(text, jsonb, bigint) to anon, authenticated;
