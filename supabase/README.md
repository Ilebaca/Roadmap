# Step 1 — the database

Everything lives in `supabase/migrations/`, three files, run in order:

| | |
|---|---|
| `…_tables.sql` | the eight tables |
| `…_security.sql` | who can see and do what |
| `…_rules.sql` | approvals, locking, the date chain |

Then `first_run.sql` once, to make yourself the admin.

They are safe to run again — each fills in what is missing and leaves the rest
alone — and parts 2 and 3 stop with "Run part 1 first" rather than a confusing
error if you take them out of order.

---

## 1. Make a Supabase project

1. **supabase.com** → sign in → **New project**.
2. Name it, set a database password — **save that password**.
3. Nearest region. Create, wait ~2 minutes.

## 2. Build the database

**If your repository is connected to Supabase**, the three migrations run on
their own — check **Database → Migrations** and skip to step 3.

**Otherwise, paste them by hand.** For each of the three files, in order:

1. **SQL Editor** → **New query**.
2. Paste the whole file.
3. Press **Ctrl/Cmd + A** first — this matters. With any text highlighted,
   Supabase runs *only the highlighted part*, which is how you end up with
   half a database and errors like `relation "public.block_links" does not exist`.
4. **Run**. "Success. No rows returned" is what you want. Notices about
   policies "does not exist, skipping" are normal.

Then run `verify.sql` the same way. Every line should read clean:

```
tables              8 of 8
missing tables      none — all 8 are there
missing functions   none — all 8 are there
row-level security  on for every table
policies            15 (expect 15)
triggers on blocks  2 (expect 2)
```

If something is missing, run that part again — nothing is broken, and
re-running repairs it.

## 3. Create your own login

1. **Authentication** → **Users** → **Add user** → **Create new user**.
2. Your email, a password, tick **Auto Confirm User**.
3. Click the new row and copy its **User UID**.

## 4. Run first_run.sql

1. Open `supabase/first_run.sql`, edit the three marked lines: your User UID,
   your email, your first client's name.
2. SQL Editor → New query → paste → **Run**.
3. It replies: `Done. Client "…" created with 7 categories. You are the admin.`

## 5. Copy the two keys the app needs

**Settings** → **API**:

- **Project URL** → `VITE_SUPABASE_URL`
- **anon / public** key → `VITE_SUPABASE_ANON_KEY`

Into `.env.local` at the repo root:

```
VITE_SUPABASE_URL=https://xxxxxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOi...
```

The anon key is meant to be in the browser — the security rules keep clients
apart, not the key. Never put the **service_role** key in the app.

That is step 1 done.

---

## Adding a client login

1. **Authentication** → **Users** → **Add user** (their email + a password).
2. Copy their User UID, then in the SQL editor:

```sql
insert into public.users (id, email, role, project_id) values
  ('THEIR-USER-UID', 'client@theircompany.com', 'viewer', 'THE-PROJECT-ID');
```

The project id is in **Table Editor → projects**. They will see that one client
and nothing else.

---

## What the rules enforce

Run against Postgres 16 and checked, not assumed:

- A client sees only their own project; an admin sees every client.
- A client cannot edit anything directly — only approve, and only a block that
  is in Review.
- Approving writes the approval and locks the block together, or not at all.
- An approved block cannot be changed by anyone, admin included, until an admin
  unapproves it.
- Pushing a deadline slides everything behind it, each keeping its duration —
  and if it would shove an approved block the whole edit is refused, not
  half-applied.
- Deleting a phase takes its blocks, links and approvals; deleting a grid takes
  its cells.
