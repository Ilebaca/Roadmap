-- =============================================================================
-- Mood board
-- Part 10. Run after the first nine.
--
-- One black canvas per client, shared with them. Images sit wherever they are
-- put; a row is a file and a position, nothing else.
--
-- This is the one place in the app a client WRITES. Everywhere else they read
-- and approve; here they pin pictures up alongside the studio, which is the
-- point of a mood board. The guard rails: they can only reach their own
-- client's board, and they can only remove what they themselves put up.
-- =============================================================================

create table if not exists public.moodboard_items (
  id         uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  file_path  text not null,                 -- object in the brand-assets bucket
  file_name  text,
  file_size  int,
  -- Canvas coordinates, in CSS pixels on an unzoomed board. Fractional because
  -- a drag does not land on whole numbers.
  x real not null default 0,
  y real not null default 0,
  w real not null default 320,
  h real not null default 320,
  -- Last one picked up is the one on top; a plain counter, not a sort order,
  -- so bringing an image forward touches one row and not all of them.
  z int not null default 0,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists moodboard_project_idx on public.moodboard_items(project_id, z);

alter table public.moodboard_items enable row level security;

drop policy if exists "moodboard read"   on public.moodboard_items;
drop policy if exists "moodboard add"    on public.moodboard_items;
drop policy if exists "moodboard move"   on public.moodboard_items;
drop policy if exists "moodboard remove" on public.moodboard_items;

create policy "moodboard read" on public.moodboard_items for select to authenticated
using (public.can_see_project(project_id));

-- Anyone on the board may pin something up, and it is stamped with who did.
create policy "moodboard add" on public.moodboard_items for insert to authenticated
with check (public.can_see_project(project_id) and created_by = auth.uid());

-- ...and move anything on it. Rearranging is what a mood board is for, and an
-- image nobody may touch but its owner is a worse board.
create policy "moodboard move" on public.moodboard_items for update to authenticated
using (public.can_see_project(project_id))
with check (public.can_see_project(project_id));

-- Taking something down is different: your own, or anything if you are the
-- studio. A client cannot clear the studio's board from under it.
create policy "moodboard remove" on public.moodboard_items for delete to authenticated
using (public.can_see_project(project_id) and (created_by = auth.uid() or public.is_admin()));

-- ---------------------------------------------------------------------------
-- The files themselves, under <project_id>/moodboard/<random>.<ext>
--
-- The bucket's existing write policy is admin-only. The board needs a second
-- one for its own folder, since a client has to be able to put a picture
-- there. Policies for a command are OR'd, so this widens that one path and
-- leaves every other folder exactly as it was.
-- ---------------------------------------------------------------------------
create or replace function public.is_moodboard_path(p text) returns boolean
language sql immutable as $$
  select (string_to_array(p, '/'))[2] = 'moodboard'
$$;

grant execute on function public.is_moodboard_path(text) to authenticated;

drop policy if exists "moodboard files add"    on storage.objects;
drop policy if exists "moodboard files remove" on storage.objects;

create policy "moodboard files add" on storage.objects for insert to authenticated
with check (
  bucket_id = 'brand-assets'
  and public.is_moodboard_path(name)
  and public.can_see_project(public.project_from_path(name))
);

create policy "moodboard files remove" on storage.objects for delete to authenticated
using (
  bucket_id = 'brand-assets'
  and public.is_moodboard_path(name)
  and public.can_see_project(public.project_from_path(name))
);
