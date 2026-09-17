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

const STORAGE_KEY = 'roadmap.mock.v1'
const LATENCY_MS = 90 // fake network latency so loading states are real

// --- local persistence (mock only; Supabase replaces this entirely) ----------
let db = load()

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw)
  } catch {
    /* private mode / blocked storage — fall through to a fresh seed */
  }
  return seed()
}

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(db))
  } catch {
    /* ignore — the app works fine from memory */
  }
}

const wait = (v) => new Promise((res) => setTimeout(() => res(v), LATENCY_MS))
const clone = (v) => JSON.parse(JSON.stringify(v))
const uid = (p) => `${p}_${Math.random().toString(36).slice(2, 9)}`

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
  // BACKEND: RLS — `project_id = (select project_id from users where id = auth.uid())`
  if (!session || session.project_id !== project_id) throw new ForbiddenError('Wrong project.')
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
    db.blocks.push(row)
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
    const allowed = ['title', 'description', 'start_date', 'end_date', 'state', 'order_index']
    for (const k of Object.keys(patch)) {
      if (!allowed.includes(k)) continue
      // 'approved' is never set through here — it is the result of an approval.
      if (k === 'state' && patch.state === 'approved') continue
      row[k] = patch[k]
    }
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
