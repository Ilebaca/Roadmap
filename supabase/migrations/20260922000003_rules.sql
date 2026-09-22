-- =============================================================================
-- Roadmap + Visual Identity — approvals, locking and the date chain
-- Part 3 of 3. Run the three files in order, top to bottom.
-- Safe to run again: it fills in what is missing and leaves the rest alone.
-- =============================================================================

-- Stop with a plain message instead of a confusing "relation does not exist"
-- if the previous part has not been run yet.
do $$ begin
  if to_regclass('public.brand_assets') is null then
    raise exception 'Run part 1 (the tables) first.';
  end if;
end $$;

--  AN APPROVED BLOCK IS FROZEN
-- Nothing may change on a locked block. unapprove_block() lifts the guard for
-- its own statement and nothing else can.
-- -----------------------------------------------------------------------------

create or replace function public.freeze_approved_blocks() returns trigger
language plpgsql as $$
begin
  if old.locked and coalesce(current_setting('app.allow_locked_update', true), 'off') <> 'on' then
    raise exception 'This block is approved and locked.';
  end if;
  return new;
end $$;

drop trigger if exists blocks_freeze_approved on public.blocks;
create trigger blocks_freeze_approved before update on public.blocks
for each row execute function public.freeze_approved_blocks();

-- -----------------------------------------------------------------------------
--  THE DATE CHAIN
-- A block never starts before the block in front of it finishes. Push a
-- deadline out and everything behind it slides, keeping its own duration.
-- -----------------------------------------------------------------------------

create or replace function public.reflow_chain(p_project_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  r        record;
  prev_end date := null;
  dur      int;
begin
  for r in
    select b.id, b.title, b.start_date, b.end_date, b.locked
    from public.blocks b
    join public.phases ph on ph.id = b.phase_id
    where ph.project_id = p_project_id
    order by ph.order_index, b.start_date, b.order_index
  loop
    if prev_end is not null and r.start_date < prev_end then
      if r.locked then
        raise exception 'That date runs into "%", which is approved. Unapprove it first.', r.title;
      end if;
      dur := r.end_date - r.start_date;
      update public.blocks
         set start_date = prev_end, end_date = prev_end + dur
       where id = r.id;
      prev_end := prev_end + dur;
    else
      prev_end := r.end_date;
    end if;
  end loop;
end $$;

create or replace function public.blocks_reflow() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- the reflow writes blocks itself; do not chase our own tail
  if coalesce(current_setting('app.reflowing', true), 'off') = 'on' then
    return null;
  end if;
  perform set_config('app.reflowing', 'on', true);
  perform public.reflow_chain(public.project_of_phase(new.phase_id));
  perform set_config('app.reflowing', 'off', true);
  return null;
end $$;

drop trigger if exists blocks_reflow_chain on public.blocks;
create trigger blocks_reflow_chain after insert or update of start_date, end_date, phase_id
on public.blocks for each row execute function public.blocks_reflow();

-- -----------------------------------------------------------------------------
--  APPROVE / UNAPPROVE
-- Each writes two tables, so each is one function and cannot half-apply.
-- Approving is open to the client; withdrawing an approval is admin only.
-- -----------------------------------------------------------------------------

create or replace function public.approve_block(p_block_id uuid)
returns public.blocks
language plpgsql security definer set search_path = public as $$
declare v_block public.blocks;
begin
  if auth.uid() is null then raise exception 'Not signed in.'; end if;
  select * into v_block from public.blocks where id = p_block_id;
  if not found then raise exception 'Block not found'; end if;
  if not public.can_see_project(public.project_of_block(p_block_id)) then
    raise exception 'Not your project';
  end if;
  if v_block.state <> 'review' then
    raise exception 'Only a block in Review can be approved.';
  end if;

  insert into public.approvals (block_id, approved_by) values (p_block_id, auth.uid());

  update public.blocks set state = 'approved', locked = true
   where id = p_block_id returning * into v_block;

  return v_block;
end $$;

create or replace function public.unapprove_block(p_block_id uuid)
returns public.blocks
language plpgsql security definer set search_path = public as $$
declare v_block public.blocks;
begin
  if not public.is_admin() then raise exception 'Admins only.'; end if;

  select * into v_block from public.blocks where id = p_block_id;
  if not found then raise exception 'Block not found'; end if;
  if v_block.state <> 'approved' then raise exception 'This block is not approved.'; end if;

  delete from public.approvals where block_id = p_block_id;

  perform set_config('app.allow_locked_update', 'on', true);
  update public.blocks set state = 'in_progress', locked = false
   where id = p_block_id returning * into v_block;
  perform set_config('app.allow_locked_update', 'off', true);

  return v_block;
end $$;

grant execute on function public.approve_block(uuid), public.unapprove_block(uuid) to authenticated;
