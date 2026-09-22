# Step 1 — the database

Two files, run in order, in the Supabase SQL editor:

1. `schema.sql` — tables, security rules, the date chain, approve/unapprove.
2. `seed.sql`   — makes you the admin and creates your first client.

Both are safe to re-run. Full walkthrough below.

---

## 1. Make a Supabase project

1. Go to **supabase.com** → sign in → **New project**.
2. Name it (e.g. `roadmap`), set a database password — **save that password somewhere**.
3. Pick the region closest to you. Create it, and wait ~2 minutes.

## 2. Run the schema

1. In the left sidebar: **SQL Editor** → **New query**.
2. Open `supabase/schema.sql` from this repo, copy **all** of it, paste it in.
3. Click into the editor and press **Ctrl/Cmd + A** — this matters: if any text
   is highlighted, Supabase runs *only the highlighted part*, which is how you
   end up with half the tables.
4. Press **Run**. You want "Success. No rows returned".
   Notices about policies "does not exist, skipping" are normal.

### If you get `relation "public.something" does not exist`

Only part of the script ran. Nothing is broken — run `supabase/verify.sql` to
see what landed, then paste the **whole** of `schema.sql` again and run it. It
is written to be re-run: existing tables are left alone and the missing ones
are filled in. (Tested: a database with only 4 of the 8 tables comes out
complete after one re-run.)

## 3. Create your own login

1. Left sidebar: **Authentication** → **Users** → **Add user** → **Create new user**.
2. Your email, a password, and tick **Auto Confirm User**.
3. Click the new row and copy its **User UID** (a long id like `9f8c…`).

## 4. Run the seed

1. Open `supabase/seed.sql`, and edit the three marked lines:
   - paste your User UID,
   - your email,
   - your first client's name.
2. **SQL Editor** → **New query** → paste → **Run**.
3. It says: `Done. Client "…" created with 7 categories. You are the admin.`

## 5. Copy the two keys the app needs

**Settings** → **API**, copy:

- **Project URL** → `VITE_SUPABASE_URL`
- **anon / public** key → `VITE_SUPABASE_ANON_KEY`

Put them in `.env.local` at the root of this repo:

```
VITE_SUPABASE_URL=https://xxxxxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOi...
```

The anon key is safe in the browser — it is the row-level security rules, not
the key, that keep clients apart. Never put the **service_role** key in the app.

## 6. Check it works

Run `supabase/verify.sql` in a new query. It should report:

```
tables              8 of 8
missing tables      none — all 8 are there
missing functions   none — all 8 are there
row-level security  on for every table
policies            15 (expect 15)
triggers on blocks  2 (expect 2)
```

**Table Editor** should also show your client under `projects`, your row under
`users` with role `admin`, and 7 rows in `brand_sections`.

That is step 1 finished. Step 2 is the storage bucket, step 3 is pointing the
app at this database.

---

## Adding a client login

1. **Authentication** → **Users** → **Add user** (their email + password).
2. Copy their User UID, then in the SQL editor:

```sql
insert into public.users (id, email, role, project_id) values
  ('THEIR-USER-UID', 'client@theircompany.com', 'viewer', 'THE-PROJECT-ID');
```

(The project id is in **Table Editor → projects**.) They will see that one
client and nothing else.

---

## What the rules enforce, so you can trust them

Checked against a real Postgres 16 before shipping:

- A client sees only their own project; an admin sees every client.
- A client cannot edit anything directly — only approve, and only a block that
  is in Review.
- Approving writes the approval and locks the block together, or not at all.
- An approved block cannot be changed by anyone, admin included, until an
  admin unapproves it.
- Pushing a deadline slides everything behind it along, each keeping its own
  duration — and if it would shove an approved block, the whole edit is
  refused rather than half-applied.
- Deleting a phase takes its blocks, links and approvals; deleting a grid takes
  its cells.
