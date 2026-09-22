/**
 * DATA LAYER — the only file in the app that touches storage.
 * -----------------------------------------------------------------------------
 * Every read and write in the UI goes through the `api` object exported here.
 * No component imports mock data directly. To go live with Supabase you replace
 * the body of each function with a query (see supabaseClient.example.js) and
 * delete mockDb.js — the signatures, the returned row shapes and every call site
 * stay exactly as they are.
 *
 * Every function is async and returns rows shaped like Postgres rows, so the
 * swap is "replace local reads/writes with queries", not a reshape.
 *
 * Each `// BACKEND:` comment marks a spot that needs a real call.
 */

import { seed } from './mockDb'
import { addDays, daysBetween } from '../lib/dates'
import { BRAND_TEMPLATES, DEFAULT_TEMPLATE_SLUGS } from '../lib/brandTemplates'

const STORAGE_KEY = 'roadmap.mock.v1'
const LATENCY_MS = 90 // fake network latency so loading states are real

// --- local persistence (mock only; Supabase replaces this entirely) ----------
let db = load()

function load() {
  const fresh = seed()
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return fresh
    const saved = JSON.parse(raw)
    // A snapshot written before a table existed would leave that table
    // undefined and every read of it would throw. Keep whatever was saved and
    // fall back to the seed for anything missing, so an old snapshot still
    // opens. (The real backend migrates instead; this goes with the mock.)
    const merged = {}
    for (const table of Object.keys(fresh)) {
      merged[table] = Array.isArray(saved?.[table]) ? saved[table] : fresh[table]
    }
    return merged
  } catch {
    /* private mode / blocked storage / unreadable snapshot — start fresh */
  }
  return fresh
}

/** Returns false when the snapshot could not be written (quota, private mode). */
function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(db))
    return true
  } catch {
    return false
  }
}

const wait = (v) => new Promise((res) => setTimeout(() => res(v), LATENCY_MS))
const clone = (v) => JSON.parse(JSON.stringify(v))
const uid = (p) => `${p}_${Math.random().toString(36).slice(2, 9)}`
const slugify = (v = '') =>
  v.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

/** Thrown when the caller is not allowed to do something. The real backend
 *  enforces the same rules in row-level security policies; this mirror keeps the
 *  UI honest while we are still local. */
class ForbiddenError extends Error {
  constructor(msg) {
    super(msg)
    this.name = 'ForbiddenError'
  }
}

function assertAdmin(session) {
  // BACKEND: this check becomes an RLS policy — `auth.uid()` must map to a user
  // row whose role = 'admin' for INSERT/UPDATE on phases and blocks.
  if (!session || session.role !== 'admin') throw new ForbiddenError('Admins only.')
}

function assertProject(session, project_id) {
  // A viewer is bound to exactly one project. An admin runs several clients and
  // switches between them from the top bar.
  // BACKEND: RLS —
  //   viewers: `project_id = (select project_id from users where id = auth.uid())`
  //   admins:  scope to the projects their organisation owns, e.g.
  //            `project_id in (select id from projects where created_by = auth.uid())`
  if (!session) throw new ForbiddenError('Not signed in.')
  if (session.role === 'admin') return
  if (session.project_id !== project_id) throw new ForbiddenError('Wrong project.')
}

/**
 * BLOCK DEPENDENCY CHAIN
 * ---------------------------------------------------------------------------
 * Blocks run one after another: a block may not start before the deadline of
 * the block in front of it. Push a deadline out and everything downstream
 * slides with it, keeping each block's own duration.
 *
 * BACKEND: this belongs in Postgres so two clients cannot race it — an AFTER
 * UPDATE trigger on `blocks` (or a `reflow_chain(p_project_id)` function called
 * inside the same transaction as the write) running exactly this rule.
 */
function chainOf(project_id) {
  const order = new Map(
    db.phases.filter((p) => p.project_id === project_id).map((p) => [p.id, p.order_index])
  )
  return db.blocks
    .filter((b) => order.has(b.phase_id))
    .sort(
      (a, b) =>
        order.get(a.phase_id) - order.get(b.phase_id) ||
        a.start_date.localeCompare(b.start_date) ||
        a.order_index - b.order_index
    )
}

/** The earliest a block may start: the deadline of the block before it. */
function earliestStart(project_id, block_id) {
  const chain = chainOf(project_id)
  const i = chain.findIndex((b) => b.id === block_id)
  return i > 0 ? chain[i - 1].end_date : null
}

/** Slide every downstream block that now starts too early. Mutates in place. */
function reflowChain(project_id) {
  const chain = chainOf(project_id)
  for (let i = 1; i < chain.length; i++) {
    const prev = chain[i - 1]
    const cur = chain[i]
    const overlap = -daysBetween(prev.end_date, cur.start_date)
    if (overlap <= 0) continue
    if (cur.locked) {
      throw new ForbiddenError(
        `That date runs into "${cur.title}", which is approved. Unapprove it first.`
      )
    }
    const duration = daysBetween(cur.start_date, cur.end_date)
    cur.start_date = addDays(cur.start_date, overlap)
    cur.end_date = addDays(cur.start_date, duration)
  }
}

/** Run a mutation, then reflow. If anything throws, nothing is written. */
function withChain(project_id, mutate) {
  const before = JSON.stringify(db.blocks)
  try {
    const out = mutate()
    reflowChain(project_id)
    return out
  } catch (e) {
    db.blocks = JSON.parse(before)
    throw e
  }
}

function projectOfPhase(phase_id) {
  return db.phases.find((p) => p.id === phase_id)?.project_id
}

export const api = {
  // ===========================================================================
  // AUTH / SESSION
  // ===========================================================================

  /**
   * Returns every account so the dev role switcher can offer them.
   * BACKEND: delete this. Accounts are never listed client-side once auth is real;
   * the signed-in user comes from `supabase.auth.getUser()` instead.
   */
  async listUsers() {
    return wait(clone(db.users))
  },

  /**
   * The signed-in user. Right now the caller passes a user id (dev role switcher).
   * BACKEND:
   *   const { data: { user } } = await supabase.auth.getUser()
   *   const { data } = await supabase.from('users').select('*').eq('id', user.id).single()
   *   return data
   */
  async getSession(userId) {
    const user = db.users.find((u) => u.id === userId) || db.users[0]
    return wait(clone(user))
  },

  /**
   * Admin creates an account. Stub UI for now.
   * BACKEND: this cannot run from the browser with an anon key — it needs
   * `supabase.auth.admin.createUser()` from an edge function / server route,
   * then an INSERT into `users` with the role and project_id.
   */
  async createUser(session, { email, role, project_id }) {
    assertAdmin(session)
    const row = { id: uid('u'), email, role, project_id }
    db.users.push(row)
    persist()
    return wait(clone(row))
  },

  // ===========================================================================
  // PROJECTS
  // ===========================================================================

  /**
   * BACKEND: supabase.from('projects').select('*')  — RLS returns only the
   * caller's project for viewers, all owned projects for admins.
   */
  async listProjects(session) {
    const rows =
      session.role === 'admin'
        ? db.projects
        : db.projects.filter((p) => p.id === session.project_id)
    return wait(clone(rows))
  },

  /**
   * Start a new client. The roadmap begins empty — the admin adds phases — but
   * Visual Identity is seeded with the standard categories so every client is
   * laid out the same way.
   * BACKEND:
   *   const { data } = await supabase.from('projects')
   *     .insert({ name, created_by: auth.uid() }).select().single()
   * and seed the categories in the same transaction, ideally a Postgres
   * function (`create_project(p_name text)`) so a half-made client is
   * impossible.
   */
  async createProject(session, { name }) {
    assertAdmin(session)
    const row = {
      id: uid('prj'),
      name: (name || '').trim() || 'New client',
      logo_url: null,
      created_by: session.id
    }
    db.projects.push(row)
    DEFAULT_TEMPLATE_SLUGS.forEach((slug, i) => {
      const t = BRAND_TEMPLATES.find((x) => x.slug === slug)
      db.brand_sections.push({
        id: uid('bs'),
        project_id: row.id,
        slug,
        title: t.title,
        blurb: t.blurb,
        template: slug,
        order_index: i
      })
    })
    persist()
    return wait(clone(row))
  },

  /**
   * Rename a client (or point it at a logo).
   * BACKEND: supabase.from('projects').update(patch).eq('id', id).select().single()
   */
  async updateProject(session, id, patch) {
    assertAdmin(session)
    const row = db.projects.find((p) => p.id === id)
    if (!row) throw new Error('Client not found')
    if ('name' in patch) row.name = (patch.name || '').trim() || row.name
    if ('logo_url' in patch) row.logo_url = patch.logo_url
    persist()
    return wait(clone(row))
  },

  async getProject(session, project_id) {
    assertProject(session, project_id)
    // BACKEND: supabase.from('projects').select('*').eq('id', project_id).single()
    return wait(clone(db.projects.find((p) => p.id === project_id) || null))
  },

  // ===========================================================================
  // PHASES
  // ===========================================================================

  /**
   * BACKEND:
   *   supabase.from('phases').select('*').eq('project_id', project_id)
   *     .order('order_index')
   */
  async listPhases(session, project_id) {
    assertProject(session, project_id)
    const rows = db.phases
      .filter((p) => p.project_id === project_id)
      .sort((a, b) => a.order_index - b.order_index)
    return wait(clone(rows))
  },

  /** BACKEND: supabase.from('phases').insert({...}).select().single() */
  async createPhase(session, { project_id, title }) {
    assertAdmin(session)
    assertProject(session, project_id)
    const siblings = db.phases.filter((p) => p.project_id === project_id)
    const row = {
      id: uid('ph'),
      project_id,
      title,
      order_index: siblings.length ? Math.max(...siblings.map((p) => p.order_index)) + 1 : 0
    }
    db.phases.push(row)
    persist()
    return wait(clone(row))
  },

  /**
   * Delete a phase and everything hanging off it — its blocks, their links and
   * their approvals. Admin only, and irreversible; the UI confirms first.
   * BACKEND: supabase.from('phases').delete().eq('id', id) — the cascade is the
   * database's job (`on delete cascade` on blocks.phase_id, block_links.block_id
   * and approvals.block_id), so this stays a single statement.
   */
  async deletePhase(session, id) {
    assertAdmin(session)
    const phase = db.phases.find((p) => p.id === id)
    if (!phase) return wait(null)
    const blockIds = db.blocks.filter((b) => b.phase_id === id).map((b) => b.id)
    db.approvals = db.approvals.filter((a) => !blockIds.includes(a.block_id))
    db.block_links = db.block_links.filter((l) => !blockIds.includes(l.block_id))
    db.blocks = db.blocks.filter((b) => b.phase_id !== id)
    db.phases = db.phases.filter((p) => p.id !== id)
    persist()
    return wait(null)
  },

  /** BACKEND: supabase.from('phases').update(patch).eq('id', id).select().single() */
  async updatePhase(session, id, patch) {
    assertAdmin(session)
    const row = db.phases.find((p) => p.id === id)
    if (!row) throw new Error('Phase not found')
    Object.assign(row, patch)
    persist()
    return wait(clone(row))
  },

  // ===========================================================================
  // BLOCKS
  // ===========================================================================

  /**
   * All blocks for a project, in one shot (the timeline draws every phase on one
   * continuous line, so it needs them together).
   * BACKEND:
   *   supabase.from('blocks').select('*, phases!inner(project_id)')
   *     .eq('phases.project_id', project_id).order('order_index')
   * or keep a denormalised project_id column on blocks for a flat query.
   */
  async listBlocks(session, project_id) {
    assertProject(session, project_id)
    const phaseIds = db.phases.filter((p) => p.project_id === project_id).map((p) => p.id)
    const rows = db.blocks
      .filter((b) => phaseIds.includes(b.phase_id))
      .sort((a, b) => a.order_index - b.order_index)
    return wait(clone(rows))
  },

  /** BACKEND: supabase.from('blocks').insert({...}).select().single() */
  async createBlock(session, { phase_id, title, description, start_date, end_date }) {
    assertAdmin(session)
    const siblings = db.blocks.filter((b) => b.phase_id === phase_id)
    const row = {
      id: uid('blk'),
      phase_id,
      order_index: siblings.length ? Math.max(...siblings.map((b) => b.order_index)) + 1 : 0,
      title: title ?? 'Untitled block',
      description: description ?? '',
      state: 'todo', // default state on creation
      start_date,
      end_date,
      locked: false
    }
    const project_id = projectOfPhase(phase_id)
    withChain(project_id, () => {
      db.blocks.push(row)
      // Fit the new block into the gap it was dropped into. Anything unlocked
      // behind it gets pushed along by reflowChain(), but an approved block
      // cannot move — so the new block ends where that one starts instead of
      // the whole thing being refused.
      const chain = chainOf(project_id)
      const i = chain.findIndex((b) => b.id === row.id)
      const prev = chain[i - 1]
      const next = chain[i + 1]
      if (prev && daysBetween(prev.end_date, row.start_date) < 0) {
        const duration = daysBetween(row.start_date, row.end_date)
        row.start_date = prev.end_date
        row.end_date = addDays(row.start_date, Math.max(1, duration))
      }
      if (next?.locked && daysBetween(row.end_date, next.start_date) < 0) {
        row.end_date = next.start_date
        if (daysBetween(row.start_date, row.end_date) < 1) {
          throw new ForbiddenError(
            `There is no room before "${next.title}", which is approved. Unapprove it or move it back first.`
          )
        }
      }
    })
    persist()
    return wait(clone(row))
  },

  /**
   * Patch title / description / start_date / end_date / state.
   * BACKEND: supabase.from('blocks').update(patch).eq('id', id).select().single()
   * A locked (approved) block must be immutable — add a Postgres policy or a
   * BEFORE UPDATE trigger that rejects updates where locked = true.
   */
  async updateBlock(session, id, patch) {
    assertAdmin(session)
    const row = db.blocks.find((b) => b.id === id)
    if (!row) throw new Error('Block not found')
    if (row.locked) throw new ForbiddenError('This block is approved and locked.')
    const project_id = projectOfPhase(row.phase_id)
    const allowed = ['title', 'description', 'start_date', 'end_date', 'state', 'order_index']

    withChain(project_id, () => {
      for (const k of Object.keys(patch)) {
        if (!allowed.includes(k)) continue
        // 'approved' is never set through here — it is the result of an approval.
        if (k === 'state' && patch.state === 'approved') continue
        row[k] = patch[k]
      }
      // A block can never start before the one in front of it finishes; the
      // blocks behind it are pushed along by reflowChain().
      const floor = earliestStart(project_id, row.id)
      if (floor && daysBetween(floor, row.start_date) < 0) {
        const duration = daysBetween(row.start_date, row.end_date)
        row.start_date = floor
        row.end_date = addDays(floor, Math.max(1, duration))
      }
      if (daysBetween(row.start_date, row.end_date) < 1) {
        row.end_date = addDays(row.start_date, 1)
      }
    })

    persist()
    return wait(clone(row))
  },

  /** BACKEND: supabase.from('blocks').delete().eq('id', id) */
  async deleteBlock(session, id) {
    assertAdmin(session)
    const row = db.blocks.find((b) => b.id === id)
    if (!row) return wait(null)
    if (row.locked) throw new ForbiddenError('This block is approved and locked.')
    db.blocks = db.blocks.filter((b) => b.id !== id)
    db.approvals = db.approvals.filter((a) => a.block_id !== id)
    persist()
    return wait(null)
  },

  // ===========================================================================
  // BLOCK LINKS (files and links a viewer opens from a block)
  // ===========================================================================

  /**
   * BACKEND:
   *   supabase.from('block_links').select('*').in('block_id', blockIds)
   *     .order('order_index')
   * For files stored in Supabase Storage, swap `url` for a signed URL created
   * on read: supabase.storage.from('block-files').createSignedUrl(path, 3600)
   */
  async listLinks(session, project_id) {
    assertProject(session, project_id)
    const phaseIds = db.phases.filter((p) => p.project_id === project_id).map((p) => p.id)
    const blockIds = db.blocks.filter((b) => phaseIds.includes(b.phase_id)).map((b) => b.id)
    const rows = db.block_links
      .filter((l) => blockIds.includes(l.block_id))
      .sort((a, b) => a.order_index - b.order_index)
    return wait(clone(rows))
  },

  /** BACKEND: supabase.from('block_links').insert({...}).select().single() */
  async createLink(session, { block_id, label, url }) {
    assertAdmin(session)
    const block = db.blocks.find((b) => b.id === block_id)
    if (!block) throw new Error('Block not found')
    if (block.locked) throw new ForbiddenError('This block is approved and locked.')
    const siblings = db.block_links.filter((l) => l.block_id === block_id)
    const row = {
      id: uid('lnk'),
      block_id,
      label: label || url,
      url,
      order_index: siblings.length ? Math.max(...siblings.map((l) => l.order_index)) + 1 : 0
    }
    db.block_links.push(row)
    persist()
    return wait(clone(row))
  },

  /** BACKEND: supabase.from('block_links').delete().eq('id', id) */
  async deleteLink(session, id) {
    assertAdmin(session)
    const row = db.block_links.find((l) => l.id === id)
    if (!row) return wait(null)
    const block = db.blocks.find((b) => b.id === row.block_id)
    if (block?.locked) throw new ForbiddenError('This block is approved and locked.')
    db.block_links = db.block_links.filter((l) => l.id !== id)
    persist()
    return wait(null)
  },

  // ===========================================================================
  // BRAND SECTIONS (the Visual Identity categories)
  // ===========================================================================

  /**
   * BACKEND:
   *   supabase.from('brand_sections').select('*').eq('project_id', project_id)
   *     .order('order_index')
   */
  async listBrandSections(session, project_id) {
    assertProject(session, project_id)
    const rows = db.brand_sections
      .filter((b) => b.project_id === project_id)
      .sort((a, b) => a.order_index - b.order_index)
    return wait(clone(rows))
  },

  /**
   * Add a category. `template` is the standard category it starts from, or null
   * for one of the admin's own.
   * BACKEND: supabase.from('brand_sections').insert({...}).select().single()
   */
  async createBrandSection(session, { project_id, title, blurb, template = null, slug }) {
    assertAdmin(session)
    assertProject(session, project_id)
    const siblings = db.brand_sections.filter((b) => b.project_id === project_id)
    const row = {
      id: uid('bs'),
      project_id,
      slug: slug || slugify(title) || uid('cat'),
      title: title || 'New category',
      blurb: blurb || '',
      template,
      order_index: siblings.length ? Math.max(...siblings.map((b) => b.order_index)) + 1 : 0
    }
    db.brand_sections.push(row)
    persist()
    return wait(clone(row))
  },

  /** BACKEND: supabase.from('brand_sections').update(patch).eq('id', id) */
  async updateBrandSection(session, id, patch) {
    assertAdmin(session)
    const row = db.brand_sections.find((b) => b.id === id)
    if (!row) throw new Error('Category not found')
    for (const k of ['title', 'blurb', 'order_index']) {
      if (k in patch) row[k] = patch[k]
    }
    persist()
    return wait(clone(row))
  },

  /**
   * BACKEND: supabase.from('brand_sections').delete().eq('id', id) — the
   * contents go with it via `on delete cascade` on brand_assets.section_id.
   */
  async deleteBrandSection(session, id) {
    assertAdmin(session)
    db.brand_sections = db.brand_sections.filter((b) => b.id !== id)
    db.brand_assets = db.brand_assets.filter((a) => a.section_id !== id)
    persist()
    return wait(null)
  },

  // ===========================================================================
  // BRAND ASSETS (what lives inside a Visual Identity category)
  // ===========================================================================

  /**
   * BACKEND:
   *   supabase.from('brand_assets').select('*, brand_sections!inner(project_id)')
   *     .eq('brand_sections.project_id', project_id).order('order_index')
   * An image or file row carries a Storage path; turn it into a signed URL on
   * read rather than storing a public one.
   */
  async listBrandAssets(session, project_id) {
    assertProject(session, project_id)
    const sectionIds = db.brand_sections
      .filter((b) => b.project_id === project_id)
      .map((b) => b.id)
    const rows = db.brand_assets
      .filter((a) => sectionIds.includes(a.section_id))
      .sort((a, b) => a.order_index - b.order_index)
    return wait(clone(rows))
  },

  /**
   * Add a piece of content to a category.
   * BACKEND: upload the File to Storage first, then insert the row with its
   * path — never the file itself:
   *   const { data } = await supabase.storage.from('brand-assets')
   *     .upload(`${project_id}/${section_id}/${crypto.randomUUID()}`, file)
   *   await supabase.from('brand_assets').insert({ ..., file_path: data.path })
   */
  async createBrandAsset(session, { section_id, kind, title, body, url, file_name, file_size }) {
    assertAdmin(session)
    const section = db.brand_sections.find((b) => b.id === section_id)
    if (!section) throw new Error('Category not found')
    const siblings = db.brand_assets.filter((a) => a.section_id === section_id)
    const row = {
      id: uid('ba'),
      section_id,
      kind,
      title: title ?? '',
      body: body ?? null,
      url: url ?? null,
      file_name: file_name ?? null,
      file_size: file_size ?? null,
      order_index: siblings.length ? Math.max(...siblings.map((a) => a.order_index)) + 1 : 0
    }
    db.brand_assets.push(row)
    // An upload only exists in browser storage while there is no backend, so a
    // failed write means it would vanish on reload. Better to refuse it now.
    if (!persist() && (kind === 'image' || kind === 'file')) {
      db.brand_assets = db.brand_assets.filter((a) => a.id !== row.id)
      persist()
      throw new ForbiddenError(
        'There is no room left in browser storage for that file. Remove a file or two — with the backend wired up they go to Supabase Storage instead.'
      )
    }
    return wait(clone(row))
  },

  /** BACKEND: supabase.from('brand_assets').update(patch).eq('id', id) */
  async updateBrandAsset(session, id, patch) {
    assertAdmin(session)
    const row = db.brand_assets.find((a) => a.id === id)
    if (!row) throw new Error('Content not found')
    for (const k of ['title', 'body', 'url', 'file_name', 'file_size', 'order_index']) {
      if (k in patch) row[k] = patch[k]
    }
    persist()
    return wait(clone(row))
  },

  /**
   * BACKEND: delete the row, and the Storage object with it:
   *   supabase.storage.from('brand-assets').remove([row.file_path])
   *   supabase.from('brand_assets').delete().eq('id', id)
   */
  async deleteBrandAsset(session, id) {
    assertAdmin(session)
    db.brand_assets = db.brand_assets.filter((a) => a.id !== id)
    persist()
    return wait(null)
  },

  /**
   * Move one item up or down inside its category by swapping order_index with
   * its neighbour.
   * BACKEND: two updates in one transaction, or a `move_brand_asset(id, dir)`
   * function, so a reorder can never half-apply.
   */
  async moveBrandAsset(session, id, direction) {
    assertAdmin(session)
    const row = db.brand_assets.find((a) => a.id === id)
    if (!row) throw new Error('Content not found')
    const siblings = db.brand_assets
      .filter((a) => a.section_id === row.section_id)
      .sort((a, b) => a.order_index - b.order_index)
    const i = siblings.findIndex((a) => a.id === id)
    const j = direction === 'up' ? i - 1 : i + 1
    if (j < 0 || j >= siblings.length) return wait(clone(row))
    // Rewrite the whole run so a snapshot with duplicate indexes still sorts.
    const reordered = [...siblings]
    ;[reordered[i], reordered[j]] = [reordered[j], reordered[i]]
    reordered.forEach((a, k) => {
      a.order_index = k
    })
    persist()
    return wait(clone(row))
  },

  // ===========================================================================
  // APPROVALS
  // ===========================================================================

  /** BACKEND: supabase.from('approvals').select('*').in('block_id', blockIds) */
  async listApprovals(session, project_id) {
    assertProject(session, project_id)
    const phaseIds = db.phases.filter((p) => p.project_id === project_id).map((p) => p.id)
    const blockIds = db.blocks.filter((b) => phaseIds.includes(b.phase_id)).map((b) => b.id)
    return wait(clone(db.approvals.filter((a) => blockIds.includes(a.block_id))))
  },

  /**
   * Approve a block. Admin OR viewer may do this, but only while the block is in
   * 'review' — the Review state IS the approval request. Approving writes the
   * approval row AND flips the block to approved + locked.
   *
   * BACKEND: do both writes in one Postgres function so they cannot diverge:
   *   create function approve_block(p_block_id uuid) returns blocks ...
   *   -- inserts into approvals (block_id, approved_by = auth.uid(), now())
   *   -- updates blocks set state='approved', locked=true where id = p_block_id
   *   --   and state = 'review'
   * then: await supabase.rpc('approve_block', { p_block_id: blockId })
   */
  async approveBlock(session, block_id) {
    const row = db.blocks.find((b) => b.id === block_id)
    if (!row) throw new Error('Block not found')
    if (row.state !== 'review') throw new ForbiddenError('Only a block in Review can be approved.')
    if (row.locked) throw new ForbiddenError('Already approved.')

    const approval = {
      id: uid('apr'),
      block_id,
      approved_by: session.id,
      approved_at: new Date().toISOString()
    }
    db.approvals.push(approval)
    row.state = 'approved'
    row.locked = true
    persist()
    return wait({ block: clone(row), approval: clone(approval) })
  },

  /**
   * Withdraw an approval. Admin only — a viewer can approve but never undo one.
   * The approval row is deleted, the block unlocks and goes back to work
   * ('in_progress'), which also re-locks any phase that depended on it.
   *
   * BACKEND: mirror approve_block with a second Postgres function so the two
   * writes stay together, and restrict it to admins:
   *   create function unapprove_block(p_block_id uuid) returns blocks ...
   *   -- delete from approvals where block_id = p_block_id
   *   -- update blocks set state='in_progress', locked=false where id = p_block_id
   * then: await supabase.rpc('unapprove_block', { p_block_id: blockId })
   */
  async unapproveBlock(session, block_id) {
    assertAdmin(session)
    const row = db.blocks.find((b) => b.id === block_id)
    if (!row) throw new Error('Block not found')
    if (row.state !== 'approved') throw new ForbiddenError('This block is not approved.')
    db.approvals = db.approvals.filter((a) => a.block_id !== block_id)
    row.state = 'in_progress'
    row.locked = false
    persist()
    return wait(clone(row))
  },

  // ===========================================================================
  // DEV ONLY — remove with the mock layer
  // ===========================================================================

  /** Wipes local storage and reloads the seed. No backend equivalent. */
  async resetMockData() {
    db = seed()
    persist()
    return wait(true)
  }
}

export { ForbiddenError }
