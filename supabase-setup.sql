-- Run this once in Supabase: Project > SQL Editor > New query > paste all > Run

create table if not exists counter (
  id int primary key default 1,
  next_number int not null default 1
);

insert into counter (id, next_number)
values (1, 1)
on conflict (id) do nothing;

-- Atomically hands out the next ticket number and advances the counter.
-- Safe even if many people press the button at the exact same time.
create or replace function take_ticket()
returns int
language plpgsql
security definer
as $$
declare
  n int;
begin
  update counter
  set next_number = next_number + 1
  where id = 1
  returning next_number - 1 into n;
  return n;
end;
$$;

-- Resets the queue back to Q001. Called by the "เริ่มรันคิวใหม่" button.
create or replace function reset_counter()
returns void
language sql
security definer
as $$
  update counter set next_number = 1 where id = 1;
$$;

-- Lock down direct table access; the public app only ever calls the two
-- functions above, never reads/writes the table directly.
alter table counter enable row level security;
revoke all on table counter from anon, authenticated;
grant execute on function take_ticket() to anon, authenticated;
grant execute on function reset_counter() to anon, authenticated;

-- Storage bucket for the per-ticket PDF, so a QR code on the ticket can
-- link to a file anyone can download from their own phone.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('tickets', 'tickets', true, 8388608, array['application/pdf'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Public read tickets" on storage.objects;
create policy "Public read tickets" on storage.objects
for select using (bucket_id = 'tickets');

drop policy if exists "Anon upload tickets" on storage.objects;
create policy "Anon upload tickets" on storage.objects
for insert to anon with check (bucket_id = 'tickets');

-- Log of every ticket whose QR/PDF was generated: ticket number, server
-- timestamp, and where its PDF lives in storage. View this anytime in
-- Table Editor > ticket_log. The public site can only add rows (via
-- log_ticket below), never read, update, or delete them directly.
create table if not exists ticket_log (
  id bigint generated always as identity primary key,
  ticket_number int not null,
  issued_at timestamptz not null default now(),
  pdf_path text
);

create or replace function log_ticket(p_number int, p_pdf_path text)
returns void
language sql
security definer
as $$
  insert into ticket_log (ticket_number, pdf_path) values (p_number, p_pdf_path);
$$;

alter table ticket_log enable row level security;
revoke all on table ticket_log from anon, authenticated;
grant execute on function log_ticket(int, text) to anon, authenticated;
