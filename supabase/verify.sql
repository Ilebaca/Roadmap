-- =============================================================================
-- What is actually in the database? Run this any time to check.
-- Expect 8 tables, 8 functions, 2 triggers and 15 policies.
-- =============================================================================

select 'tables' as thing,
       (select count(*) from unnest(array['projects','users','phases','blocks','block_links',
                                          'approvals','brand_sections','brand_assets']) as t(name)
        where to_regclass('public.' || name) is not null) || ' of 8' as got;

select 'missing tables' as thing,
       coalesce(string_agg(name, ', '), 'none — all 8 are there') as detail
from unnest(array['projects','users','phases','blocks','block_links',
                  'approvals','brand_sections','brand_assets']) as t(name)
where to_regclass('public.' || name) is null;

select 'missing functions' as thing,
       coalesce(string_agg(name, ', '), 'none — all 8 are there') as detail
from unnest(array['is_admin','my_project','can_see_project','project_of_phase',
                  'project_of_block','project_of_section','approve_block','unapprove_block']) as t(name)
where not exists (
  select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = t.name
);

select 'row-level security' as thing,
       coalesce(string_agg(tablename, ', '), 'on for every table') as tables_without_it
from pg_tables
where schemaname = 'public' and not rowsecurity;

select 'policies' as thing, count(*) || ' (expect 15)' as detail
from pg_policies where schemaname = 'public';

select 'triggers on blocks' as thing, count(*) || ' (expect 2)' as detail
from pg_trigger where tgrelid = 'public.blocks'::regclass and not tgisinternal;
