-- =============================================================================
-- Roadmap + Visual Identity — whose job is this block?
-- Part 7. Run after parts 1-6.
-- Safe to run again: it fills in what is missing and leaves the rest alone.
-- =============================================================================

do $$ begin
  if to_regclass('public.blocks') is null then
    raise exception 'Run part 1 (the tables) first.';
  end if;
end $$;

-- Every block is somebody's to do. Saying which removes the commonest reason a
-- roadmap stalls: both sides waiting on each other. Existing blocks become the
-- studio's, which is what they were in practice.
alter table public.blocks add column if not exists owner text not null default 'studio';

do $$ begin
  if not exists (
    select 1 from pg_constraint where conname = 'blocks_owner_check'
  ) then
    alter table public.blocks
      add constraint blocks_owner_check check (owner in ('studio','client'));
  end if;
end $$;
