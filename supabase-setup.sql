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
