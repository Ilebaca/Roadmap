-- =============================================================================
-- A day's work, and a record of who did what
-- Part 11. Run after the first ten.
--
-- Two things, both about blocks:
--
-- 1. A block may begin and end on the same day. Plenty of work is a day's
--    work, and the next block may begin on the day the one before it ends —
--    a deadline is a handover, not a day off. The table said otherwise.
--
-- 2. Every state a block passes through is written down, with who moved it.
--    A roadmap is a record of an agreement, and "when did this go to review,
--    and who approved it" is the question it exists to answer months later.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. One-day blocks
--
-- The original constraint was written inline and so carries whatever name
-- Postgres gave it; it is found by what it says rather than by that name.
-- ---------------------------------------------------------------------------
do $$
declare c record;
begin
  for c in
    select conname
      from pg_constraint
     where conrelid = 'public.blocks'::regclass
       and contype = 'c'
       and pg_get_constraintdef(oid) like '%end_date%'
       and pg_get_constraintdef(oid) like '%start_date%'
       and pg_get_constraintdef(oid) not like '%>=%'
  loop
    execute format('alter table public.blocks drop constraint %I', c.conname);
  end loop;
end $$;

alter table public.blocks drop constraint if exists blocks_dates_check;
alter table public.blocks
  add constraint blocks_dates_check check (end_date >= start_date);

-- ---------------------------------------------------------------------------
-- 2. The log
--
-- The actor's address is copied onto the row rather than joined at read time.
-- A client cannot read the users table beyond their own row, so a join would
-- show them "someone" for every move the studio made — and an audit line that
-- cannot say who is not an audit line. It is also what an archive wants: the
-- address as it was on the day, not whatever the account is called now.
-- ---------------------------------------------------------------------------
create table if not exists public.block_events (
  id          uuid primary key default gen_random_uuid(),
  block_id    uuid not null references public.blocks(id) on delete cascade,
  actor_id    uuid references auth.users(id) on delete set null,
  actor_email text,
  -- created | state | owner | dates | renamed | approved | unapproved
  kind        text not null,
  -- What changed, as {from, to}. Shapeless on purpose: a date change carries
  -- two dates, a state change two words, and a creation carries nothing.
  detail      jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

create index if not exists block_events_block_idx
  on public.block_events(block_id, created_at);

alter table public.block_events enable row level security;

drop policy if exists "history read"  on public.block_events;
drop policy if exists "history write" on public.block_events;

-- Anyone who can see the work can see what happened to it. That is the point:
-- the client reads the same record the studio does.
create policy "history read" on public.block_events for select to authenticated
using (public.can_see_project(public.project_of_block(block_id)));

-- Anyone who can change a block can write a line saying they did, and the line
-- can only ever be signed with their own name.
create policy "history write" on public.block_events for insert to authenticated
with check (
  public.can_see_project(public.project_of_block(block_id))
  and (actor_id is null or actor_id = auth.uid())
);

-- No update and no delete policy, so there is none: a log that can be edited
-- is not a log. Rows go when the block they belong to goes, by the cascade.
