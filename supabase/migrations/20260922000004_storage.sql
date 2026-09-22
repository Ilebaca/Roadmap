-- =============================================================================
-- Roadmap + Visual Identity — file storage
-- Part 4. Run after the first three.
--
-- One private bucket, `brand-assets`. Files are stored under the client they
-- belong to:  <project_id>/<section_id>/<random>.<ext>
-- so the same rule as everywhere else applies — a client reaches their own
-- files and no one else's, and only an admin can put files there or remove them.
-- =============================================================================

insert into storage.buckets (id, name, public)
values ('brand-assets', 'brand-assets', false)
on conflict (id) do nothing;

-- The first folder in the path is the project. Returns null for anything that
-- is not laid out that way, which the policies then refuse.
create or replace function public.project_from_path(p text) returns uuid
language plpgsql immutable as $$
begin
  return (string_to_array(p, '/'))[1]::uuid;
exception when others then
  return null;
end $$;

grant execute on function public.project_from_path(text) to authenticated;

drop policy if exists "brand assets read"  on storage.objects;
drop policy if exists "brand assets write" on storage.objects;

create policy "brand assets read" on storage.objects for select to authenticated
using (
  bucket_id = 'brand-assets'
  and public.can_see_project(public.project_from_path(name))
);

create policy "brand assets write" on storage.objects for all to authenticated
using (
  bucket_id = 'brand-assets' and public.is_admin()
)
with check (
  bucket_id = 'brand-assets' and public.is_admin()
);
