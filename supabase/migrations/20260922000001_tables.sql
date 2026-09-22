-- =============================================================================
-- Roadmap + Visual Identity — tables
-- Part 1 of 3. Run the three files in order, top to bottom.
-- Safe to run again: it fills in what is missing and leaves the rest alone.
-- =============================================================================

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
