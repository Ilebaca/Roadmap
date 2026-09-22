-- =============================================================================
-- First run: make yourself the admin and set up your first client.
--
-- BEFORE RUNNING: create your own login first —
--   Supabase dashboard -> Authentication -> Users -> Add user
--   (email + password, tick "Auto Confirm User")
-- then copy the new user's ID and paste it below.
-- =============================================================================

do $$
declare
  -- ⬇⬇⬇ THE ONLY THREE LINES YOU EDIT ⬇⬇⬇
  v_admin_id    uuid := '00000000-0000-0000-0000-000000000000';  -- paste the User UID
  v_admin_email text := 'you@yourstudio.com';
  v_client_name text := 'First Client';
  -- ⬆⬆⬆ -------------------------------- ⬆⬆⬆

  v_project uuid;
  v_slugs   text[] := array['logo-system','color-palette','typography-system',
                            'visual-language','ai-prompts-guide','brand-voice','downloadables'];
  v_titles  text[] := array['Logo system','Color palette','Typography system',
                            'Visual language','AI prompts guide','Brand voice and messaging','Downloadables'];
  i int;
begin
  if not exists (select 1 from auth.users where id = v_admin_id) then
    raise exception 'No auth user with id %. Create the user first, then paste its ID.', v_admin_id;
  end if;

  insert into public.projects (name, created_by) values (v_client_name, v_admin_id)
    returning id into v_project;

  insert into public.users (id, email, role, project_id)
    values (v_admin_id, v_admin_email, 'admin', v_project)
    on conflict (id) do update set role = 'admin', email = excluded.email;

  -- the standard Visual Identity categories, in order
  for i in 1 .. array_length(v_slugs, 1) loop
    insert into public.brand_sections (project_id, slug, title, template, order_index)
      values (v_project, v_slugs[i], v_titles[i], v_slugs[i], i - 1);
  end loop;

  raise notice 'Done. Client "%" created with % categories. You are the admin.',
    v_client_name, array_length(v_slugs, 1);
end $$;

-- -----------------------------------------------------------------------------
-- Adding a client login later:
--   1. Authentication -> Users -> Add user (their email + a password)
--   2. copy their User UID and the project id you want them bound to, then:
--
-- insert into public.users (id, email, role, project_id) values
--   ('THEIR-USER-UID', 'client@theircompany.com', 'viewer', 'THE-PROJECT-ID');
--
-- A viewer sees that one project and nothing else.
-- -----------------------------------------------------------------------------
