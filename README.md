# Roadmap — phased approval timeline

A single-page React app: a vertical date line with content blocks, phase tabs
that unlock only when the previous phase is fully approved, and a separate
approve action that locks a block for everyone.

**There is no backend.** All data is mock data held in one isolated module, with
optional `localStorage` persistence so a refresh keeps your changes. Everything
is shaped so Supabase (auth + Postgres + RLS) drops in later without touching
the UI.

---

## Run locally

```bash
npm install
npm run dev      # http://localhost:5173
```

```bash
npm run build    # static output in /dist
npm run preview  # serve the build locally
```

Node 18+ required.

---

## Using it

A **DEV** pill in the top right switches between **Admin** and **Viewer**. That
toggle is the only stand-in for auth and disappears the moment real sign-in
lands.

| | Admin | Viewer |
|---|---|---|
| Create phases and blocks | ✅ | — |
| Edit title / description | ✅ | — |
| Set dates, drag-resize | ✅ | — |
| Set state (To Do → Review) | ✅ | — |
| Attach / remove links and files | ✅ | — |
| Open links and files | ✅ | ✅ |
| Approve a block in Review | ✅ | ✅ |
| Undo an approval | ✅ | — |
| Create accounts (stub) | ✅ | — |

**Approve is not a state.** An admin sets a block to **Review** — that *is* the
approval request. Only then does the Approve box appear. Clicking it writes an
approval row, flips the block to `approved` and sets `locked = true`: the block
goes gray, stops being editable and nobody can change its state again.

When every block in a phase is approved, the phase is complete and the next tab
unlocks. Locked tabs are disabled in the sidebar and their contents are hidden
on the line.

**Undoing an approval.** An approved block shows an *Unapprove* button next to
its approval stamp — admin only, a viewer never sees it. It deletes the approval
row, unlocks the block, returns it to *In Progress*, and re-locks any later phase
that was relying on it. That is also why the pen next to the dates disappears
once a block is approved: an approved block is frozen until it is unapproved.

**Dates.** The start date and the deadline sit in the block's top-right corner.
The pen beside them swaps the range for two date pickers; it appears only for an
admin, and only while the block is unapproved.

**Blocks run in sequence.** A block can never start before the block in front of
it finishes. Push a deadline out — by dragging the bottom edge or picking a new
date — and every block behind it slides along with it, each keeping its own
duration. Dragging a top edge back stops dead at the previous block's deadline.
The rule is enforced in the data layer, not just the UI, so any write goes
through it. If the slide would run into an *approved* block, the whole edit is
rejected with a message rather than half-applied — unapprove that block first.

**Today.** A live marker crosses the line at today's date, interpolated between
the two dots it falls between. It re-checks the clock every 30 seconds, so it
moves on its own and rolls over at midnight without a reload. The seeded mock
dates are generated relative to today so there is always something around it.

**Block chrome.** Top-left is the delete button while work is open, and the
green *Approved* mark once it is signed off — never both. State sits under the
description: a coloured dropdown for an admin, the same chip read-only for a
viewer. State colour is the only colour in the UI.

**Links and files.** Each block has its own *Links & files* shelf. Admins add and
remove entries; everyone can open them in a new tab. Rows live in their own
`block_links` table so the `blocks` row stays exactly the shape of its table —
when Supabase Storage is wired up, `url` becomes a signed URL.

**Dragging.** With Admin selected, grab the top or bottom edge of a block
(a grip appears on hover) and drag. The edge follows the line, snapping onto any
other date dot as it passes — as far up or down as you like — and the block's
start or end date updates on release. A block never shrinks below the height of
its own content, so a block with more text pushes its two dates further apart.

**Reset data** in the top bar restores the seeded mock rows.

---

## Where the backend goes

```
src/
  services/
    dataClient.js            ← THE DATA LAYER. Every read/write in the app.
    mockDb.js                ← seed rows, shaped exactly like Postgres rows
    supabaseClient.example.js← the target schema + RLS sketch (not wired in)
  state/store.jsx            ← calls dataClient, holds UI state
  lib/{permissions,layout,dates}.js
  components/{Sidebar,Timeline,BlockCard,AccountsModal,Icons}.jsx
```

No component imports mock data. Every call goes through `api.*` in
`dataClient.js`, every function is `async`, and every function body carries a
`// BACKEND:` comment with the Supabase query that replaces it. The swap is:

1. `npm i @supabase/supabase-js`, set `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`.
2. Rename `supabaseClient.example.js` → `supabaseClient.js` and run the SQL in
   its header comment.
3. Replace each body in `dataClient.js` with the query in its comment. Delete
   `mockDb.js`.
4. Replace the dev role toggle in `src/App.jsx` with a real sign-in, and
   `api.getSession()` with `supabase.auth.getUser()`.

Row shapes already match the target tables — `users`, `projects`, `phases`,
`blocks`, `block_links`, `approvals` — same field names, same value sets, so
nothing reshapes.

Two things the mock layer fakes that Postgres must enforce for real:

- **Write permission.** `assertAdmin` / `assertProject` in `dataClient.js` are a
  client-side mirror of the RLS policies. The policies are what actually count.
- **Locking.** An approved block must be immutable server-side (a `BEFORE UPDATE`
  trigger rejecting rows where `locked = true`). Approving and unapproving each
  touch two tables, so each should be a single Postgres function —
  `approve_block` open to viewers and admins, `unapprove_block` admin-only.

Viewers are bound to a single project via `users.project_id`; the mock data
includes a second project and a second viewer so that scoping is visible before
RLS exists.

---

## Deploy for the Webflow embed

The build is plain static files — any static host works.

**Vercel**

```bash
npm i -g vercel
vercel            # first run links the project
vercel --prod
```
Framework preset: **Vite**. Build command `npm run build`, output directory
`dist`. (`vercel.json` in this repo sets the SPA rewrite.)

**Cloudflare Pages**

Connect the repo, build command `npm run build`, output directory `dist`.

### Embedding in Webflow

Webflow is only the shell — give the embed the whole viewport.

1. Drop an **Embed** element onto the page, full width, and paste:

```html
<iframe
  src="https://YOUR-DEPLOY-URL.vercel.app"
  style="width:100%;height:100vh;border:0;display:block"
  title="Roadmap"
  allow="clipboard-write"
></iframe>
```

2. On the page's body/wrapper set `margin: 0` and `overflow: hidden` so the
   iframe is the only scroller — the app scrolls internally inside the timeline
   section, which already has 40px outer margins and rounded corners.
3. If the page has a fixed Webflow nav, use `height: calc(100vh - 80px)` instead.

Neither Vercel nor Cloudflare sends `X-Frame-Options` by default, so the embed
works as-is. To lock it to your domain later, add a
`Content-Security-Policy: frame-ancestors https://your-site.webflow.io https://yourdomain.com`
header in `vercel.json` or a Cloudflare Pages `_headers` file.

> Note: some browsers block `localStorage` inside a cross-site iframe. The data
> layer catches that and runs from memory instead, so the embed still works —
> changes just don't survive a reload until the real backend is in.
