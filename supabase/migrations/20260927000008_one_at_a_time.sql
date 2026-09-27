-- =============================================================================
-- Roadmap — one block at a time
-- Part 8. Run after parts 1-7.
-- Safe to run again: it replaces the function and leaves the rest alone.
-- =============================================================================

do $$ begin
  if to_regclass('public.roadmaps') is null then
    raise exception 'Run part 6 first.';
  end if;
end $$;

-- -----------------------------------------------------------------------------
--  APPROVING IN ORDER
-- The app already draws the queue and hides the button on anything but the live
-- block, but that is a drawing. Approving is a function anyone signed in may
-- call with any id, so the rule has to hold here or it does not hold: put a
-- later block into Review and its client could sign it off while the work in
-- front of it is still open.
--
-- The order is the one the timeline draws in — phase, then start date, then
-- position — so what the queue looks like and what it enforces cannot diverge.
-- -----------------------------------------------------------------------------

create or replace function public.approve_block(p_block_id uuid)
returns public.blocks
language plpgsql security definer set search_path = public as $$
declare
  v_block   public.blocks;
  v_roadmap uuid;
  v_earlier text;
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

  select ph.roadmap_id into v_roadmap from public.phases ph where ph.id = v_block.phase_id;

  -- Anything ahead of it in the queue that is not signed off yet.
  select b.title into v_earlier
    from public.blocks b
    join public.phases ph on ph.id = b.phase_id
   where ph.roadmap_id is not distinct from v_roadmap
     and b.state <> 'approved'
     and b.id <> p_block_id
     and (ph.order_index, b.start_date, b.order_index)
       < (select ph2.order_index, b2.start_date, b2.order_index
            from public.blocks b2 join public.phases ph2 on ph2.id = b2.phase_id
           where b2.id = p_block_id)
   order by ph.order_index, b.start_date, b.order_index
   limit 1;

  if v_earlier is not null then
    raise exception '"%" comes first and is not approved yet.', v_earlier;
  end if;

  insert into public.approvals (block_id, approved_by) values (p_block_id, auth.uid());

  update public.blocks set state = 'approved', locked = true
   where id = p_block_id returning * into v_block;

  return v_block;
end $$;

grant execute on function public.approve_block(uuid) to authenticated;
