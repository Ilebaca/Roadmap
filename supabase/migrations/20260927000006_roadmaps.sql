-- =============================================================================
-- Roadmap + Visual Identity — several roadmaps per client
-- Part 6. Run after parts 1-5.
-- Safe to run again: it fills in what is missing and leaves the rest alone.
-- =============================================================================

do $$ begin
  if to_regclass('public.phases') is null then
    raise exception 'Run part 1 (the tables) first.';
  end if;
end $$;

-- -----------------------------------------------------------------------------
--  A NOTE ON NAMES
-- `public.projects` is the CLIENT. It has been that since part 1 — every policy,
-- the storage paths and users.project_id all key off it — so it keeps its name
-- rather than a rename rippling through all of them. What the app calls a
-- "project" is a roadmap: one client, several roadmaps, each with its own
-- phases. Visual Identity stays with the client, since a brand belongs to the
-- client rather than to one job.
-- -----------------------------------------------------------------------------

create table if not exists public.roadmaps (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects(id) on delete cascade, -- the client
  name        text not null,
  order_index int  not null default 0,
  created_at  timestamptz not null default now()
);

create index if not exists roadmaps_project_idx on public.roadmaps(project_id, order_index);

-- A phase now belongs to a roadmap. It keeps project_id as well: every policy
-- written in part 2 reads it, and carrying it here means none of them have to
-- learn about the new table. The two are kept in step by the trigger below
-- rather than by trusting every caller to pass both.
alter table public.phases add column if not exists roadmap_id uuid
  references public.roadmaps(id) on delete cascade;

create index if not exists phases_roadmap_idx on public.phases(roadmap_id, order_index);

-- -----------------------------------------------------------------------------
--  EXISTING WORK KEEPS ITS PLACE
-- Everything already drawn belongs to one roadmap per client, so nothing moves
-- and nobody has to reorganise anything by hand.
-- -----------------------------------------------------------------------------

do $$
declare c record; r uuid;
begin
  for c in select distinct project_id from public.phases where roadmap_id is null loop
    insert into public.roadmaps (project_id, name) values (c.project_id, 'Roadmap')
    returning id into r;
    update public.phases set roadmap_id = r
     where project_id = c.project_id and roadmap_id is null;
  end loop;

  -- A client with no phases yet still needs somewhere to put the first one.
  insert into public.roadmaps (project_id, name)
  select p.id, 'Roadmap' from public.projects p
   where not exists (select 1 from public.roadmaps r where r.project_id = p.id);
end $$;

-- A client made from here on gets its first roadmap the moment it exists, so
-- there is never a client with nowhere to put a phase — and no caller has to
-- remember to make one.
create or replace function public.client_first_roadmap() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.roadmaps (project_id, name) values (new.id, 'Roadmap');
  return new;
end $$;

drop trigger if exists projects_first_roadmap on public.projects;
create trigger projects_first_roadmap after insert on public.projects
for each row execute function public.client_first_roadmap();

-- -----------------------------------------------------------------------------
--  project_id FOLLOWS roadmap_id
-- One source of truth. A phase says which roadmap it is in; which client that
-- is, is the roadmap's business, not the caller's.
-- -----------------------------------------------------------------------------

create or replace function public.phase_project_from_roadmap() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.roadmap_id is not null then
    select project_id into new.project_id from public.roadmaps where id = new.roadmap_id;
  end if;
  return new;
end $$;

drop trigger if exists phases_sync_project on public.phases;
create trigger phases_sync_project before insert or update of roadmap_id on public.phases
for each row execute function public.phase_project_from_roadmap();

-- -----------------------------------------------------------------------------
--  WHO CAN SEE THEM
-- Same rule as everything else: read your own client, write only as an admin.
-- -----------------------------------------------------------------------------

create or replace function public.project_of_roadmap(p uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select project_id from public.roadmaps where id = p
$$;

grant execute on function public.project_of_roadmap(uuid) to authenticated;
grant select, insert, update, delete on public.roadmaps to authenticated;

alter table public.roadmaps enable row level security;

drop policy if exists roadmaps_read  on public.roadmaps;
drop policy if exists roadmaps_write on public.roadmaps;
create policy roadmaps_read  on public.roadmaps for select to authenticated
  using (public.can_see_project(project_id));
create policy roadmaps_write on public.roadmaps for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- -----------------------------------------------------------------------------
--  DELETING
-- Both cascade all the way down — a roadmap takes its phases, their blocks and
-- those blocks' links and approvals; a client takes its roadmaps and its
-- Visual Identity too. Each is one statement so it cannot half-apply.
--
-- Files in Storage are NOT removed by this: Postgres cannot reach into the
-- bucket. They are orphaned, unreachable through the app, and cost a little
-- space until somebody clears them out in the dashboard.
-- -----------------------------------------------------------------------------

create or replace function public.delete_roadmap(p_roadmap_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Admins only.'; end if;
  if not exists (select 1 from public.roadmaps where id = p_roadmap_id) then
    raise exception 'That roadmap no longer exists.';
  end if;
  delete from public.roadmaps where id = p_roadmap_id;
end $$;

create or replace function public.delete_client(p_project_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Admins only.'; end if;
  if (select count(*) from public.projects) <= 1 then
    raise exception 'This is your only client. Make another one before removing it.';
  end if;

  -- Anyone bound to this client loses their way in rather than their login;
  -- the app tells them they have no access and an admin can re-invite them.
  update public.users set project_id = null where project_id = p_project_id;
  delete from public.invites where project_id = p_project_id;
  delete from public.projects where id = p_project_id;
end $$;

grant execute on function
  public.delete_roadmap(uuid), public.delete_client(uuid)
  to authenticated;
