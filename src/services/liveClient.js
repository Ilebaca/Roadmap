import { supabase } from './supabaseClient'
import { BRAND_TEMPLATES, DEFAULT_TEMPLATE_SLUGS } from '../lib/brandTemplates'

/**
 * LIVE BACKEND — the same calls as the mock, against Supabase.
 *
 * Two things move from the app into the database here, because that is where
 * they belong once more than one person is using it:
 *   - who may see and do what, enforced by row-level security;
 *   - approving, unapproving and the date chain, which each touch two tables
 *     and run as one Postgres function so they cannot half-apply.
 * So these functions mostly just ask for rows and let the database refuse.
 */

const BUCKET = 'brand-assets'
const SIGNED_URL_TTL = 60 * 60 // an hour is plenty for a page view

/** PostgREST hands errors back rather than throwing. */
function ok({ data, error }) {
  if (error) throw new Error(error.message)
  return data
}

/** Signed links for the files in a set of rows, in one round trip. */
async function withSignedUrls(rows) {
  const paths = rows.map((r) => r.file_path).filter(Boolean)
  if (!paths.length) return rows
  const { data } = await supabase.storage.from(BUCKET).createSignedUrls(paths, SIGNED_URL_TTL)
  const byPath = new Map((data ?? []).map((d) => [d.path, d.signedUrl]))
  return rows.map((r) => (r.file_path ? { ...r, url: byPath.get(r.file_path) ?? null } : r))
}

const ext = (name = '') => (name.includes('.') ? '.' + name.split('.').pop().toLowerCase() : '')

export const liveApi = {
  // ===========================================================================
  // AUTH
  // ===========================================================================

  async signIn({ email, password }) {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw new Error(error.message)
  },

  async signOut() {
    await supabase.auth.signOut()
  },

  /** Calls back whenever the signed-in user changes. Returns an unsubscribe. */
  onAuthChange(fn) {
    const { data } = supabase.auth.onAuthStateChange(() => fn())
    return () => data.subscription.unsubscribe()
  },

  /**
   * The signed-in user's row, or null when nobody is signed in. The argument
   * the mock takes (which account to be) is ignored — the session decides.
   */
  async getSession() {
    const { data: auth } = await supabase.auth.getUser()
    if (!auth?.user) return null
    const { data, error } = await supabase.from('users').select('*').eq('id', auth.user.id).single()
    if (error) {
      throw new Error(
        `Signed in as ${auth.user.email}, but there is no row for you in the users table. ` +
          'Run first_run.sql with this account’s User UID to make yourself the admin.'
      )
    }
    return data
  },

  /** Every account this session is allowed to see — admins see all. */
  async listUsers() {
    return ok(await supabase.from('users').select('*').order('email'))
  },

  /**
   * Creating a login cannot happen from the browser: it needs the service_role
   * key, which must never ship in the app. Add the person under
   * Authentication -> Users in the dashboard, then insert their row here.
   */
  async createUser(session, { email, role, project_id }) {
    throw new Error(
      `Add ${email} under Authentication → Users in Supabase, then run:\n\n` +
        `insert into public.users (id, email, role, project_id)\nvalues ('THEIR-USER-UID', '${email}', '${role}', '${project_id}');`
    )
  },

  // ===========================================================================
  // PROJECTS
  // ===========================================================================

  async listProjects() {
    return ok(await supabase.from('projects').select('*').order('name'))
  },

  async getProject(session, project_id) {
    return ok(await supabase.from('projects').select('*').eq('id', project_id).single())
  },

  async createProject(session, { name }) {
    const project = ok(
      await supabase
        .from('projects')
        .insert({ name: (name || '').trim() || 'New client' })
        .select()
        .single()
    )
    // A new client starts with the standard Visual Identity categories.
    const rows = DEFAULT_TEMPLATE_SLUGS.map((slug, i) => {
      const t = BRAND_TEMPLATES.find((x) => x.slug === slug)
      return {
        project_id: project.id,
        slug,
        title: t.title,
        blurb: t.blurb,
        template: slug,
        order_index: i
      }
    })
    ok(await supabase.from('brand_sections').insert(rows))
    return project
  },

  async updateProject(session, id, patch) {
    const clean = {}
    if ('name' in patch && patch.name?.trim()) clean.name = patch.name.trim()
    if ('logo_url' in patch) clean.logo_url = patch.logo_url
    return ok(await supabase.from('projects').update(clean).eq('id', id).select().single())
  },

  // ===========================================================================
  // PHASES
  // ===========================================================================

  async listPhases(session, project_id) {
    return ok(
      await supabase.from('phases').select('*').eq('project_id', project_id).order('order_index')
    )
  },

  async createPhase(session, { project_id, title }) {
    const siblings = ok(
      await supabase.from('phases').select('order_index').eq('project_id', project_id)
    )
    const order_index = siblings.length ? Math.max(...siblings.map((p) => p.order_index)) + 1 : 0
    return ok(
      await supabase.from('phases').insert({ project_id, title, order_index }).select().single()
    )
  },

  async updatePhase(session, id, patch) {
    return ok(await supabase.from('phases').update(patch).eq('id', id).select().single())
  },

  /** The blocks, links and approvals under it go too, by cascade. */
  async deletePhase(session, id) {
    ok(await supabase.from('phases').delete().eq('id', id))
    return null
  },

  // ===========================================================================
  // BLOCKS
  // ===========================================================================

  async listBlocks(session, project_id) {
    const phases = ok(await supabase.from('phases').select('id').eq('project_id', project_id))
    if (!phases.length) return []
    return ok(
      await supabase
        .from('blocks')
        .select('*')
        .in('phase_id', phases.map((p) => p.id))
        .order('order_index')
    )
  },

  /**
   * The database slides everything behind a new block along; what it cannot do
   * is shorten the new one to fit a gap in front of an approved block, so that
   * happens here, the same way the mock does it.
   */
  async createBlock(session, { phase_id, title, description, start_date, end_date }) {
    const phase = ok(await supabase.from('phases').select('project_id').eq('id', phase_id).single())
    const chain = await liveApi.listBlocks(session, phase.project_id)
    const phases = ok(
      await supabase.from('phases').select('id, order_index').eq('project_id', phase.project_id)
    )
    const rank = new Map(phases.map((p) => [p.id, p.order_index]))
    const ordered = [...chain].sort(
      (a, b) =>
        rank.get(a.phase_id) - rank.get(b.phase_id) ||
        a.start_date.localeCompare(b.start_date) ||
        a.order_index - b.order_index
    )

    const day = 86400000
    const iso = (d) => new Date(d).toISOString().slice(0, 10)
    let start = start_date
    let end = end_date

    const before = ordered.filter((b) => b.start_date <= start).at(-1)
    if (before && before.end_date > start) {
      const span = (Date.parse(end) - Date.parse(start)) / day
      start = before.end_date
      end = iso(Date.parse(start) + Math.max(1, span) * day)
    }
    const after = ordered.find((b) => b.start_date >= start)
    if (after?.locked && after.start_date < end) {
      end = after.start_date
      if (Date.parse(end) - Date.parse(start) < day) {
        throw new Error(
          `There is no room before "${after.title}", which is approved. Unapprove it or move it back first.`
        )
      }
    }

    const siblings = ok(await supabase.from('blocks').select('order_index').eq('phase_id', phase_id))
    return ok(
      await supabase
        .from('blocks')
        .insert({
          phase_id,
          title: title ?? 'Untitled block',
          description: description ?? '',
          state: 'todo',
          start_date: start,
          end_date: end,
          locked: false,
          order_index: siblings.length ? Math.max(...siblings.map((b) => b.order_index)) + 1 : 0
        })
        .select()
        .single()
    )
  },

  /** Approving is not an edit — it goes through approveBlock(). */
  async updateBlock(session, id, patch) {
    const clean = {}
    for (const k of ['title', 'description', 'start_date', 'end_date', 'state', 'order_index']) {
      if (k in patch && !(k === 'state' && patch.state === 'approved')) clean[k] = patch[k]
    }
    return ok(await supabase.from('blocks').update(clean).eq('id', id).select().single())
  },

  async deleteBlock(session, id) {
    ok(await supabase.from('blocks').delete().eq('id', id))
    return null
  },

  // ===========================================================================
  // BLOCK LINKS
  // ===========================================================================

  async listLinks(session, project_id) {
    const blocks = await liveApi.listBlocks(session, project_id)
    if (!blocks.length) return []
    return ok(
      await supabase
        .from('block_links')
        .select('*')
        .in('block_id', blocks.map((b) => b.id))
        .order('order_index')
    )
  },

  async createLink(session, { block_id, label, url }) {
    const siblings = ok(
      await supabase.from('block_links').select('order_index').eq('block_id', block_id)
    )
    return ok(
      await supabase
        .from('block_links')
        .insert({
          block_id,
          label: label || url,
          url,
          order_index: siblings.length ? Math.max(...siblings.map((l) => l.order_index)) + 1 : 0
        })
        .select()
        .single()
    )
  },

  async deleteLink(session, id) {
    ok(await supabase.from('block_links').delete().eq('id', id))
    return null
  },

  // ===========================================================================
  // APPROVALS
  // ===========================================================================

  async listApprovals(session, project_id) {
    const blocks = await liveApi.listBlocks(session, project_id)
    if (!blocks.length) return []
    return ok(
      await supabase
        .from('approvals')
        .select('*')
        .in('block_id', blocks.map((b) => b.id))
    )
  },

  /** One function, so the approval row and the lock land together or not at all. */
  async approveBlock(session, block_id) {
    const block = ok(await supabase.rpc('approve_block', { p_block_id: block_id }))
    return { block, approval: null }
  },

  async unapproveBlock(session, block_id) {
    return ok(await supabase.rpc('unapprove_block', { p_block_id: block_id }))
  },

  // ===========================================================================
  // VISUAL IDENTITY — categories
  // ===========================================================================

  async listBrandSections(session, project_id) {
    return ok(
      await supabase
        .from('brand_sections')
        .select('*')
        .eq('project_id', project_id)
        .order('order_index')
    )
  },

  async createBrandSection(session, { project_id, title, blurb, template = null, slug }) {
    const siblings = ok(
      await supabase.from('brand_sections').select('order_index').eq('project_id', project_id)
    )
    return ok(
      await supabase
        .from('brand_sections')
        .insert({
          project_id,
          slug: slug || (title || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'category',
          title: title || 'New category',
          blurb: blurb || '',
          template,
          order_index: siblings.length ? Math.max(...siblings.map((b) => b.order_index)) + 1 : 0
        })
        .select()
        .single()
    )
  },

  async updateBrandSection(session, id, patch) {
    const clean = {}
    for (const k of ['title', 'blurb', 'order_index']) if (k in patch) clean[k] = patch[k]
    return ok(await supabase.from('brand_sections').update(clean).eq('id', id).select().single())
  },

  async deleteBrandSection(session, id) {
    ok(await supabase.from('brand_sections').delete().eq('id', id))
    return null
  },

  async reorderBrandSections(session, project_id, orderedIds) {
    await Promise.all(
      orderedIds.map((id, i) =>
        supabase.from('brand_sections').update({ order_index: i }).eq('id', id)
      )
    )
    return true
  },

  // ===========================================================================
  // VISUAL IDENTITY — contents
  // ===========================================================================

  async listBrandAssets(session, project_id) {
    const sections = ok(
      await supabase.from('brand_sections').select('id').eq('project_id', project_id)
    )
    if (!sections.length) return []
    const rows = ok(
      await supabase
        .from('brand_assets')
        .select('*')
        .in('section_id', sections.map((s) => s.id))
        .order('order_index')
    )
    return withSignedUrls(rows)
  },

  /**
   * `file` is a File from a picker. It goes to Storage under the client it
   * belongs to, and the row keeps the path; the page gets a signed link.
   */
  async createBrandAsset(session, { section_id, kind, title, body, url, size, parent_id = null, columns, file }) {
    const section = ok(
      await supabase.from('brand_sections').select('project_id').eq('id', section_id).single()
    )

    let file_path = null
    let file_name = null
    let file_size = null
    if (file) {
      file_path = `${section.project_id}/${section_id}/${crypto.randomUUID()}${ext(file.name)}`
      const { error } = await supabase.storage.from(BUCKET).upload(file_path, file)
      if (error) throw new Error(`That file could not be uploaded: ${error.message}`)
      file_name = file.name
      file_size = file.size
    }

    const siblings = ok(
      await supabase
        .from('brand_assets')
        .select('order_index')
        .eq('section_id', section_id)
        .is('parent_id', parent_id ?? null)
    )

    const row = ok(
      await supabase
        .from('brand_assets')
        .insert({
          section_id,
          parent_id,
          kind,
          title: title ?? null,
          body: body ?? null,
          url: url ?? null,
          size: size ?? (kind === 'heading' ? 'm' : null),
          columns: columns ?? (kind === 'grid' ? 2 : null),
          file_path,
          file_name,
          file_size,
          order_index: siblings.length ? Math.max(...siblings.map((a) => a.order_index)) + 1 : 0
        })
        .select()
        .single()
    )
    return (await withSignedUrls([row]))[0]
  },

  async updateBrandAsset(session, id, patch) {
    const clean = {}
    for (const k of ['kind', 'title', 'body', 'url', 'size', 'columns', 'order_index']) {
      if (k in patch) clean[k] = patch[k]
    }

    // Switching an empty cell to a picture, by choosing one for it.
    if (patch.file) {
      const row = ok(
        await supabase
          .from('brand_assets')
          .select('section_id, brand_sections(project_id)')
          .eq('id', id)
          .single()
      )
      const project_id = row.brand_sections.project_id
      const file_path = `${project_id}/${row.section_id}/${crypto.randomUUID()}${ext(patch.file.name)}`
      const { error } = await supabase.storage.from(BUCKET).upload(file_path, patch.file)
      if (error) throw new Error(`That file could not be uploaded: ${error.message}`)
      clean.file_path = file_path
      clean.file_name = patch.file.name
      clean.file_size = patch.file.size
    }

    const updated = ok(await supabase.from('brand_assets').update(clean).eq('id', id).select().single())
    return (await withSignedUrls([updated]))[0]
  },

  /** A grid takes its cells with it; the files behind them go too. */
  async deleteBrandAsset(session, id) {
    const doomed = ok(
      await supabase.from('brand_assets').select('id, file_path').or(`id.eq.${id},parent_id.eq.${id}`)
    )
    const paths = doomed.map((a) => a.file_path).filter(Boolean)
    if (paths.length) await supabase.storage.from(BUCKET).remove(paths)
    ok(await supabase.from('brand_assets').delete().eq('id', id))
    return null
  },

  async reorderBrandAssets(session, section_id, orderedIds) {
    await Promise.all(
      orderedIds.map((id, i) => supabase.from('brand_assets').update({ order_index: i }).eq('id', id))
    )
    return true
  },

  async moveBrandAsset(session, id, direction) {
    const row = ok(await supabase.from('brand_assets').select('*').eq('id', id).single())
    const q = supabase.from('brand_assets').select('id, order_index').eq('section_id', row.section_id)
    const siblings = ok(
      await (row.parent_id ? q.eq('parent_id', row.parent_id) : q.is('parent_id', null))
    ).sort((a, b) => a.order_index - b.order_index)

    const i = siblings.findIndex((a) => a.id === id)
    const j = direction === 'up' ? i - 1 : i + 1
    if (j < 0 || j >= siblings.length) return row
    ;[siblings[i], siblings[j]] = [siblings[j], siblings[i]]
    await Promise.all(
      siblings.map((a, k) => supabase.from('brand_assets').update({ order_index: k }).eq('id', a.id))
    )
    return row
  },

  // ===========================================================================
  // DEV ONLY
  // ===========================================================================

  async resetMockData() {
    throw new Error('That only works on the demo data, not on a real database.')
  }
}
