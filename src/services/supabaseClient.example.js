/**
 * NOT WIRED IN — this is the shape of the swap, kept next to the data layer so
 * the migration is obvious. Nothing imports this file.
 *
 * 1. npm i @supabase/supabase-js
 * 2. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.local
 * 3. Rename this to supabaseClient.js, then replace the bodies in dataClient.js
 *    with the queries in its `// BACKEND:` comments. Delete mockDb.js.
 *
 * SQL sketch of the target schema (matches the mock row shapes 1:1):
 *
 *   create table projects (
 *     id uuid primary key default gen_random_uuid(),
 *     name text not null,
 *     created_by uuid references auth.users(id)
 *   );
 *
 *   create table users (
 *     id uuid primary key references auth.users(id) on delete cascade,
 *     email text not null,
 *     role text not null check (role in ('admin','viewer')),
 *     project_id uuid references projects(id)
 *   );
 *
 *   create table phases (
 *     id uuid primary key default gen_random_uuid(),
 *     project_id uuid not null references projects(id) on delete cascade,
 *     title text not null,
 *     order_index int not null
 *   );
 *
 *   create table blocks (
 *     id uuid primary key default gen_random_uuid(),
 *     phase_id uuid not null references phases(id) on delete cascade,
 *     title text not null default 'Untitled block',
 *     description text not null default '',
 *     state text not null default 'todo'
 *       check (state in ('todo','in_progress','on_hold','review','approved')),
 *     start_date date not null,
 *     end_date date not null,
 *     order_index int not null default 0,
 *     locked boolean not null default false
 *   );
 *
 *   create table block_links (
 *     id uuid primary key default gen_random_uuid(),
 *     block_id uuid not null references blocks(id) on delete cascade,
 *     label text not null,
 *     url text not null,
 *     order_index int not null default 0
 *   );
 *
 *   create table approvals (
 *     id uuid primary key default gen_random_uuid(),
 *     block_id uuid not null unique references blocks(id) on delete cascade,
 *     approved_by uuid not null references users(id),
 *     approved_at timestamptz not null default now()
 *   );
 *
 * ROW-LEVEL SECURITY sketch:
 *   -- everyone reads only their own project
 *   create policy "own project" on phases for select
 *     using (project_id = (select project_id from users where id = auth.uid()));
 *   -- only admins write
 *   create policy "admins write" on blocks for all
 *     using ((select role from users where id = auth.uid()) = 'admin');
 *   -- approved blocks are frozen (trigger, since RLS cannot see OLD cleanly)
 *   create trigger freeze_approved before update on blocks ...
 *
 * APPROVE / UNAPPROVE both write two tables, so each is one function:
 *   approve_block(p_block_id)   -- viewer or admin, only from state 'review'
 *   unapprove_block(p_block_id) -- admin only; deletes the approval row and
 *                               -- sets state='in_progress', locked=false
 */

// import { createClient } from '@supabase/supabase-js'
//
// export const supabase = createClient(
//   import.meta.env.VITE_SUPABASE_URL,
//   import.meta.env.VITE_SUPABASE_ANON_KEY
// )

export {}
