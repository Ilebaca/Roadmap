-- =============================================================================
-- Roadmap + Visual Identity — who can see and do what
-- Part 2 of 3. Run the three files in order, top to bottom.
-- Safe to run again: it fills in what is missing and leaves the rest alone.
-- =============================================================================

-- Stop with a plain message instead of a confusing "relation does not exist"
-- if the previous part has not been run yet.
do $$ begin
  if to_regclass('public.brand_assets') is null then
    raise exception 'Run part 1 (the tables) first.';
  end if;
end $$;

--  WHO IS ASKING
-- These read the users table with the policy checks bypassed (security definer),
-- which is what stops a policy on `users` from calling itself forever.
-- -----------------------------------------------------------------------------

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select role = 'admin' from public.users where id = auth.uid()), false)
$$;

create or replace function public.my_project() returns uuid
language sql stable security definer set search_path = public as $$
  select project_id from public.users where id = auth.uid()
$$;

-- An admin runs every client; a viewer only ever sees the one they are bound to.
create or replace function public.can_see_project(p uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_admin() or p = public.my_project()
$$;

create or replace function public.project_of_phase(p uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select project_id from public.phases where id = p
$$;

create or replace function public.project_of_block(p uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select ph.project_id from public.blocks b join public.phases ph on ph.id = b.phase_id
  where b.id = p
$$;

create or replace function public.project_of_section(p uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select project_id from public.brand_sections where id = p
$$;

grant execute on function
  public.is_admin(), public.my_project(), public.can_see_project(uuid),
  public.project_of_phase(uuid), public.project_of_block(uuid), public.project_of_section(uuid)
  to authenticated;

--  ROW-LEVEL SECURITY
-- Read: your own project (any project, if you are an admin).
-- Write: admins only. Approving is the one thing a viewer may do, and it goes
-- through approve_block() below rather than a direct write.
-- -----------------------------------------------------------------------------

alter table public.projects       enable row level security;
alter table public.users          enable row level security;
alter table public.phases         enable row level security;
alter table public.blocks         enable row level security;
alter table public.block_links    enable row level security;
alter table public.approvals      enable row level security;
alter table public.brand_sections enable row level security;
alter table public.brand_assets   enable row level security;

drop policy if exists projects_read  on public.projects;
drop policy if exists projects_write on public.projects;
create policy projects_read  on public.projects for select to authenticated
  using (public.can_see_project(id));
create policy projects_write on public.projects for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists users_read  on public.users;
drop policy if exists users_write on public.users;
create policy users_read  on public.users for select to authenticated
  using (id = auth.uid() or public.is_admin());
create policy users_write on public.users for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists phases_read  on public.phases;
drop policy if exists phases_write on public.phases;
create policy phases_read  on public.phases for select to authenticated
  using (public.can_see_project(project_id));
create policy phases_write on public.phases for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists blocks_read  on public.blocks;
drop policy if exists blocks_write on public.blocks;
create policy blocks_read  on public.blocks for select to authenticated
  using (public.can_see_project(public.project_of_phase(phase_id)));
create policy blocks_write on public.blocks for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists links_read  on public.block_links;
drop policy if exists links_write on public.block_links;
create policy links_read  on public.block_links for select to authenticated
  using (public.can_see_project(public.project_of_block(block_id)));
create policy links_write on public.block_links for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists approvals_read on public.approvals;
create policy approvals_read on public.approvals for select to authenticated
  using (public.can_see_project(public.project_of_block(block_id)));
-- no insert/update/delete policy on purpose: approve_block() does those writes

drop policy if exists sections_read  on public.brand_sections;
drop policy if exists sections_write on public.brand_sections;
create policy sections_read  on public.brand_sections for select to authenticated
  using (public.can_see_project(project_id));
create policy sections_write on public.brand_sections for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists assets_read  on public.brand_assets;
drop policy if exists assets_write on public.brand_assets;
create policy assets_read  on public.brand_assets for select to authenticated
  using (public.can_see_project(public.project_of_section(section_id)));
create policy assets_write on public.brand_assets for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
