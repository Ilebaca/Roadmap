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
| Approve a block in Review | ✅ | ✅ |
| Create accounts (stub) | ✅ | — |

**Approve is not a state.** An admin sets a block to **Review** — that *is* the
approval request. Only then does the Approve box appear. Clicking it writes an
approval row, flips the block to `approved` and sets `locked = true`: the block
goes gray, stops being editable and nobody can change its state again.

When every block in a phase is approved, the phase is complete and the next tab
unlocks. Locked tabs are disabled in the sidebar and their contents are hidden
on the line.

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
`blocks`, `approvals` — same field names, same value sets, so nothing reshapes.

Two things the mock layer fakes that Postgres must enforce for real:

- **Write permission.** `assertAdmin` / `assertProject` in `dataClient.js` are a
  client-side mirror of the RLS policies. The policies are what actually count.
- **Locking.** An approved block must be immutable server-side (a `BEFORE UPDATE`
  trigger rejecting rows where `locked = true`), and approving should be one
  Postgres function that writes the approval row and flips the block together.

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
