-- =============================================================================
-- Roadmap — why a block ran past its deadline
-- Part 9. Run after parts 1-8.
-- Safe to run again: it fills in what is missing and leaves the rest alone.
-- =============================================================================

do $$ begin
  if to_regclass('public.blocks') is null then
    raise exception 'Run part 1 (the tables) first.';
  end if;
end $$;

-- Whether a block is overdue is NOT stored. It is today's date against
-- end_date, worked out when the app draws — so it is right the moment it
-- becomes true, with no job running each midnight to notice, and no column
-- that can be left stale. end_date keeps meaning the deadline that was agreed,
-- which is exactly the thing worth still being able to see once it has passed.
--
-- The one thing that cannot be derived is why. That is this column.
alter table public.blocks add column if not exists overdue_reason text;
