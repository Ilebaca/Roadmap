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

Then run `verify.sql` the same way. It is one query, so the editor shows the
whole answer — every row should say `ok`:

```
check               found           status
tables              8 of 8          ok
functions           8 of 8          ok
row-level security  8 of 8 tables   ok
policies            15 of 15        ok
triggers on blocks  2 of 2          ok
```

Anything else names what is missing and which part to run again. Nothing is
broken by a half-run; re-running that part repairs it.

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

# Step 2 — file storage

Images and zips go in a private bucket, filed under the client they belong to.

1. **SQL Editor** → **New query** → paste
   `supabase/migrations/20260922000004_storage.sql` → **Run**.
   (Or let the connected repository run it.)
2. **Storage** in the sidebar should now list a bucket called **brand-assets**,
   marked private.

Files are stored as `<project_id>/<section_id>/<random>.<ext>`, and the rules
read the project out of that path: a client reaches their own files and nobody
else's, and only an admin can add or remove them. Reads go through short-lived
signed URLs — nothing in the bucket is public.

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


---

# Step 3 — point the app at it

The app talks to one file, `src/services/dataClient.js`, which picks a backend:
with Supabase keys configured it uses your database, without them it runs the
built-in demo data. Components never know the difference.

1. Create a file called `.env.local` in the root of the repo:

```
VITE_SUPABASE_URL=https://YOUR-PROJECT-ID.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR-PUBLISHABLE-OR-ANON-KEY
```

Either key works — the new `sb_publishable_…` one or the older `eyJ…` anon
one. Both are meant to be in a browser; the rules from step 1 are what keep
clients apart. `.env.local` is git-ignored, so it stays on your machine.

2. `npm install` then `npm run dev`, and open http://localhost:5173.
3. You should get a **sign-in screen** rather than the demo. Sign in with the
   email and password you created in step 1.

### If something is wrong it will say so

- *"Signed in as …, but there is no row for you in the users table"* — the
  account exists but `first_run.sql` was not run with its User UID.
- *"Failed to fetch"* — the URL in `.env.local` is wrong, or the project is
  paused.
- *"Invalid login credentials"* — wrong password; reset it under
  Authentication → Users.

### What changes once it is live

- The dev Admin/Viewer toggle disappears; you are whoever you signed in as,
  with a **Sign out** button instead.
- Images and zips go to the `brand-assets` bucket, not the browser, so the
  2 MB demo cap is gone and files survive a different computer.
- Approving, unapproving and the date chain run in the database, so two people
  working at once cannot end up with different answers.
- **Accounts** still opens, but creating a login has to happen in the Supabase
  dashboard — the app tells you the exact SQL to run afterwards. Creating auth
  users from a browser needs the service_role key, which must never ship in
  the app.
