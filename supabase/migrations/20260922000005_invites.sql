-- =============================================================================
-- Roadmap + Visual Identity — client logins
-- Part 5 of 5. Run after parts 1-4.
-- Safe to run again: it fills in what is missing and leaves the rest alone.
-- =============================================================================

-- Stop with a plain message instead of a confusing "relation does not exist"
-- if the earlier parts have not been run yet.
do $$ begin
  if to_regclass('public.users') is null then
    raise exception 'Run part 1 (the tables) first.';
  end if;
end $$;

-- -----------------------------------------------------------------------------
--  INVITES
-- Creating a login needs the service_role key, which must never ship in a
-- browser app. So the admin does not create the account: they write down who
-- is allowed in and which client they belong to, and the person claims it by
-- signing up with that email. The trigger below is what turns a fresh signup
-- into an account bound to one project.
-- -----------------------------------------------------------------------------

create table if not exists public.invites (
  id          uuid primary key default gen_random_uuid(),
  email       text not null,
  role        text not null check (role in ('admin','viewer')),
  project_id  uuid references public.projects(id) on delete cascade,
  created_by  uuid references auth.users(id),
  created_at  timestamptz not null default now(),
  claimed_at  timestamptz,
  claimed_by  uuid references auth.users(id)
);

-- One open invite per address; claimed ones stay as a record of who let who in.
create unique index if not exists invites_open_email_idx
  on public.invites (lower(email)) where claimed_at is null;

-- Supabase grants these by default on anything created in public; spelled out
-- so the table does not depend on that.
grant select, insert, update, delete on public.invites to authenticated;

alter table public.invites enable row level security;

drop policy if exists invites_admin on public.invites;
create policy invites_admin on public.invites for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- -----------------------------------------------------------------------------
--  CLAIMING
-- Runs as the table owner, so it can write `users` for somebody who does not
-- have an account yet — which is the whole point.
-- -----------------------------------------------------------------------------

create or replace function public.claim_invite() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_invite public.invites;
begin
  select * into v_invite
    from public.invites
   where lower(email) = lower(new.email) and claimed_at is null
   order by created_at
   limit 1;

  -- No invite: they get an account they cannot use anything with. The app says
  -- as much, and an admin can still let them in afterwards.
  if not found then return new; end if;

  insert into public.users (id, email, role, project_id)
  values (new.id, new.email, v_invite.role, v_invite.project_id)
  on conflict (id) do update
     set role = excluded.role, project_id = excluded.project_id;

  update public.invites
     set claimed_at = now(), claimed_by = new.id
   where id = v_invite.id;

  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
for each row execute function public.claim_invite();

-- -----------------------------------------------------------------------------
--  WRITING AN INVITE
-- An admin cannot read auth.users, so this checks for an existing signup on
-- their behalf: invite somebody who already has a login and they are let in on
-- the spot instead of waiting for a signup that has already happened.
-- -----------------------------------------------------------------------------

create or replace function public.create_invite(p_email text, p_role text, p_project_id uuid)
returns public.invites
language plpgsql security definer set search_path = public as $$
declare
  v_email text := lower(trim(p_email));
  v_uid   uuid;
  v_row   public.invites;
begin
  if not public.is_admin() then raise exception 'Admins only.'; end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'That does not look like an email address.';
  end if;
  if p_role not in ('admin','viewer') then raise exception 'Unknown role.'; end if;
  if p_role = 'viewer' and p_project_id is null then
    raise exception 'A viewer has to belong to a client.';
  end if;

  -- Re-inviting the same address replaces the open invite rather than failing.
  delete from public.invites where lower(email) = v_email and claimed_at is null;

  insert into public.invites (email, role, project_id, created_by)
  values (v_email, p_role, p_project_id, auth.uid())
  returning * into v_row;

  select id into v_uid from auth.users where lower(email) = v_email limit 1;

  if v_uid is not null then
    insert into public.users (id, email, role, project_id)
    values (v_uid, v_email, p_role, p_project_id)
    on conflict (id) do update
       set role = excluded.role, project_id = excluded.project_id;

    update public.invites
       set claimed_at = now(), claimed_by = v_uid
     where id = v_row.id
    returning * into v_row;
  end if;

  return v_row;
end $$;

-- -----------------------------------------------------------------------------
--  TAKING ACCESS AWAY
-- The login itself stays — only an admin with the service_role key can delete
-- one. Removing the row is what matters: without it every policy in part 2
-- refuses, so they sign in to a page telling them they have no access.
-- -----------------------------------------------------------------------------

create or replace function public.revoke_access(p_user_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Admins only.'; end if;
  if p_user_id = auth.uid() then raise exception 'You cannot remove your own access.'; end if;

  delete from public.invites where claimed_by = p_user_id;
  delete from public.users where id = p_user_id;
end $$;

grant execute on function
  public.create_invite(text, text, uuid), public.revoke_access(uuid)
  to authenticated;
