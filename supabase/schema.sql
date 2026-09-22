-- =============================================================================
-- Roadmap + Visual Identity — database schema
-- Paste this whole file into the Supabase SQL editor and run it once.
-- It is safe to re-run: everything is created "if not exists" or replaced.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. TABLES  (same names and columns the app already uses)
-- -----------------------------------------------------------------------------

create table if not exists public.projects (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,                 -- the client, shown in the top bar
  logo_url    text,                          -- Storage object; initials if null
  created_by  uuid references auth.users(id),
  created_at  timestamptz not null default now()
);

create table if not exists public.users (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text not null,
  role        text not null check (role in ('admin','viewer')),
  project_id  uuid references public.projects(id) on delete set null,
  created_at  timestamptz not null default now()
);

create table if not exists public.phases (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects(id) on delete cascade,
  title       text not null,
  order_index int  not null default 0
);

create table if not exists public.blocks (
  id          uuid primary key default gen_random_uuid(),
  phase_id    uuid not null references public.phases(id) on delete cascade,
  title       text not null default 'Untitled block',
  description text not null default '',
  state       text not null default 'todo'
              check (state in ('todo','in_progress','on_hold','review','approved')),
  start_date  date not null,
  end_date    date not null,
  order_index int  not null default 0,
  locked      boolean not null default false,
  check (end_date > start_date)
);

create table if not exists public.block_links (
  id          uuid primary key default gen_random_uuid(),
  block_id    uuid not null references public.blocks(id) on delete cascade,
  label       text not null,
  url         text not null,
  order_index int  not null default 0
);

create table if not exists public.approvals (
  id          uuid primary key default gen_random_uuid(),
  block_id    uuid not null unique references public.blocks(id) on delete cascade,
  approved_by uuid not null references public.users(id),
  approved_at timestamptz not null default now()
);

create table if not exists public.brand_sections (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects(id) on delete cascade,
  slug        text not null,
  title       text not null,
  blurb       text not null default '',
  template    text,                          -- standard category it came from
  order_index int  not null default 0
);

create table if not exists public.brand_assets (
  id          uuid primary key default gen_random_uuid(),
  section_id  uuid not null references public.brand_sections(id) on delete cascade,
  parent_id   uuid references public.brand_assets(id) on delete cascade, -- cell in a grid
  kind        text not null
              check (kind in ('heading','paragraph','image','grid','file','link')),
  title       text,        -- null = this block has no heading part
  body        text,        -- null = this block has no text part
  size        text,        -- headline size: 's' | 'm' | 'l'
  columns     int,         -- cells a grid was made with
  url         text,        -- external link, for kind = 'link'
  file_path   text,        -- Storage object, for kind in ('image','file')
  file_name   text,
  file_size   int,
  order_index int not null default 0
);

create index if not exists phases_project_idx        on public.phases(project_id, order_index);
create index if not exists blocks_phase_idx          on public.blocks(phase_id, order_index);
create index if not exists block_links_block_idx     on public.block_links(block_id, order_index);
create index if not exists brand_sections_proj_idx   on public.brand_sections(project_id, order_index);
create index if not exists brand_assets_section_idx  on public.brand_assets(section_id, order_index);
create index if not exists brand_assets_parent_idx   on public.brand_assets(parent_id);

-- -----------------------------------------------------------------------------
-- 2. WHO IS ASKING
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

-- -----------------------------------------------------------------------------
-- 3. ROW-LEVEL SECURITY
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

-- -----------------------------------------------------------------------------
-- 4. AN APPROVED BLOCK IS FROZEN
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
-- 5. THE DATE CHAIN
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
-- 6. APPROVE / UNAPPROVE
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
