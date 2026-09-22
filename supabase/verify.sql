-- =============================================================================
-- What is actually in the database? One query, one table of answers.
-- Every row should read "ok".
-- =============================================================================

with t(name) as (select unnest(array['projects','users','phases','blocks',
                                     'block_links','approvals','brand_sections','brand_assets'])),
     f(name) as (select unnest(array['is_admin','my_project','can_see_project','project_of_phase',
                                     'project_of_block','project_of_section','approve_block','unapprove_block']))
select 'tables' as check,
       (select count(*) from t where to_regclass('public.' || name) is not null) || ' of 8' as found,
       case when (select count(*) from t where to_regclass('public.' || name) is null) = 0
            then 'ok' else 'MISSING: ' || (select string_agg(name, ', ') from t
                                           where to_regclass('public.' || name) is null) end as status
union all
select 'functions',
       (select count(*) from f where exists (
          select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public' and p.proname = f.name)) || ' of 8',
       case when (select count(*) from f where not exists (
                    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                    where n.nspname = 'public' and p.proname = f.name)) = 0
            then 'ok' else 'MISSING: ' || (select string_agg(name, ', ') from f where not exists (
                    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                    where n.nspname = 'public' and p.proname = f.name)) end
union all
select 'row-level security',
       (select count(*)::text from pg_tables where schemaname = 'public' and rowsecurity) || ' of 8 tables',
       case when (select count(*) from pg_tables where schemaname = 'public' and not rowsecurity) = 0
            then 'ok' else 'OFF FOR: ' || (select string_agg(tablename, ', ') from pg_tables
                                           where schemaname = 'public' and not rowsecurity) end
union all
select 'policies',
       (select count(*)::text from pg_policies where schemaname = 'public') || ' of 15',
       case when (select count(*) from pg_policies where schemaname = 'public') = 15
            then 'ok' else 'run part 2 again' end
union all
select 'triggers on blocks',
       (select count(*)::text from pg_trigger
        where tgrelid = 'public.blocks'::regclass and not tgisinternal) || ' of 2',
       case when (select count(*) from pg_trigger
                  where tgrelid = 'public.blocks'::regclass and not tgisinternal) = 2
            then 'ok' else 'run part 3 again' end;
