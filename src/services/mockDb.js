import { BRAND_TEMPLATES, DEFAULT_TEMPLATE_SLUGS } from '../lib/brandTemplates'

/**
 * MOCK DATABASE
 * -----------------------------------------------------------------------------
 * Every object below is shaped exactly like the Postgres row it will become in
 * Supabase. Same table names, same column names, same types. When the backend is
 * wired in, this file is deleted and `dataClient.js` swaps local reads/writes for
 * Supabase queries -- nothing else in the app changes.
 *
 * Tables: users, projects, phases, blocks, block_links, approvals,
 * brand_sections, brand_assets
 * Relationships: project 1-N phases, phase 1-N blocks, block 1-N links,
 * block 0..1 approval, project 1-N brand_sections.
 */

/**
 * Seed dates are generated relative to today so the "now" marker on the date
 * line always has something around it. A real backend stores absolute dates;
 * this helper disappears with the mock layer.
 */
const t = new Date()
const BASE = Date.UTC(t.getFullYear(), t.getMonth(), t.getDate())
const D = (offsetDays) => new Date(BASE + offsetDays * 86400000).toISOString().slice(0, 10)
const TS = (offsetDays) => new Date(BASE + offsetDays * 86400000 + 10 * 3600000).toISOString()

/** Every client's Visual Identity starts from the standard template catalogue. */
const brandSectionsFor = (project_id, slugs = DEFAULT_TEMPLATE_SLUGS) =>
  slugs.map((slug, i) => {
    const t = BRAND_TEMPLATES.find((x) => x.slug === slug)
    return {
      id: `bs_${project_id}_${slug}`,
      project_id,
      slug,
      title: t.title,
      blurb: t.blurb,
      template: slug, // which standard category this came from; null once custom
      order_index: i
    }
  })

export const seed = () => ({
  // TABLE: users
  // Supabase: `users` (or `profiles` keyed to auth.users.id).
  // RLS later: a viewer may only read rows where project_id = their own.
  users: [
    { id: 'u_admin', email: 'studio@lebaca.com', role: 'admin', project_id: 'prj_1' },
    { id: 'u_viewer', email: 'client@acme.com', role: 'viewer', project_id: 'prj_1' },
    // Second project exists only to prove viewers are scoped to one project.
    { id: 'u_viewer_2', email: 'client@northwind.com', role: 'viewer', project_id: 'prj_2' }
  ],

  // TABLE: projects
  // One project = one client engagement. `name` is the client shown in the top
  // bar; `logo_url` is null here and falls back to initials — later it points at
  // a Supabase Storage object.
  projects: [
    { id: 'prj_1', name: 'Acme Studios', logo_url: null, created_by: 'u_admin' },
    { id: 'prj_2', name: 'Northwind Coffee', logo_url: null, created_by: 'u_admin' },
    { id: 'prj_3', name: 'Vantage Labs', logo_url: null, created_by: 'u_admin' }
  ],

  // TABLE: phases  (order_index drives sidebar order AND the dependency chain)
  phases: [
    { id: 'ph_1', project_id: 'prj_1', title: 'Discovery', order_index: 0 },
    { id: 'ph_2', project_id: 'prj_1', title: 'Concept & Design', order_index: 1 },
    { id: 'ph_3', project_id: 'prj_1', title: 'Production', order_index: 2 },
    { id: 'ph_4', project_id: 'prj_1', title: 'Launch', order_index: 3 },
    // A second client, so the admin's client switcher has somewhere to go.
    { id: 'ph_5', project_id: 'prj_2', title: 'Kickoff', order_index: 0 },
    { id: 'ph_6', project_id: 'prj_2', title: 'Site Design', order_index: 1 },
    { id: 'ph_7', project_id: 'prj_2', title: 'Build', order_index: 2 },
    // A third client with nothing started yet.
    { id: 'ph_8', project_id: 'prj_3', title: 'Discovery', order_index: 0 }
  ],

  // TABLE: blocks
  // state: 'todo' | 'in_progress' | 'on_hold' | 'review' | 'approved'
  // locked: true once approved -> nobody can edit or change state again.
  blocks: [
    // --- Phase 1: fully approved, so Phase 2 is unlocked ---------------------
    {
      id: 'blk_1', phase_id: 'ph_1', order_index: 0,
      title: 'Kickoff & stakeholder interviews',
      description:
        'Two workshops with the leadership team, plus five 1:1 interviews. Output is a written positioning brief and the list of constraints we design against.',
      state: 'approved', start_date: D(-74), end_date: D(-60), locked: true
    },
    {
      id: 'blk_2', phase_id: 'ph_1', order_index: 1,
      title: 'Audit & competitive landscape',
      description:
        'Teardown of the current identity across every touchpoint, benchmarked against six competitors.',
      state: 'approved', start_date: D(-58), end_date: D(-44), locked: true
    },

    // --- Phase 2: the live phase, one block of each state --------------------
    {
      id: 'blk_3', phase_id: 'ph_2', order_index: 0,
      title: 'Moodboards & art direction',
      description:
        'Three distinct directions, each with typography, palette and image treatment. You pick one to carry forward.',
      state: 'approved', start_date: D(-40), end_date: D(-26), locked: true
    },
    {
      id: 'blk_4', phase_id: 'ph_2', order_index: 1,
      title: 'Logotype & wordmark',
      description:
        'Refined lockup in horizontal, stacked and icon-only variants. Ready for your sign-off — approve to unlock production.',
      state: 'review', start_date: D(-24), end_date: D(-6), locked: false
    },
    {
      id: 'blk_5', phase_id: 'ph_2', order_index: 2,
      title: 'Colour system & type scale',
      description:
        'Primary, secondary and support palettes with contrast tested to WCAG AA. Type scale across print and screen.',
      state: 'in_progress', start_date: D(-4), end_date: D(10), locked: false
    },
    {
      id: 'blk_6', phase_id: 'ph_2', order_index: 3,
      title: 'Brand guidelines draft',
      description: 'First pass of the guideline document. Blocked until the type scale is signed off.',
      state: 'on_hold', start_date: D(12), end_date: D(22), locked: false
    },

    // --- Phase 3: seeded but invisible until Phase 2 is fully approved -------
    {
      id: 'blk_7', phase_id: 'ph_3', order_index: 0,
      title: 'Asset production',
      description: 'Export the full asset library: logo files, templates, social kit.',
      state: 'todo', start_date: D(26), end_date: D(40), locked: false
    },
    {
      id: 'blk_8', phase_id: 'ph_3', order_index: 1,
      title: 'Handover documentation',
      description: 'Written handover with file map and usage rules.',
      state: 'todo', start_date: D(42), end_date: D(52), locked: false
    },

    // --- Northwind Coffee (prj_2) -------------------------------------------
    {
      id: 'blk_9', phase_id: 'ph_5', order_index: 0,
      title: 'Scope & sitemap',
      description: 'Page inventory, what stays, what goes, and the new navigation.',
      state: 'approved', start_date: D(-30), end_date: D(-18), locked: true
    },
    {
      id: 'blk_10', phase_id: 'ph_5', order_index: 1,
      title: 'Content audit',
      description: 'Every page rated keep / rewrite / bin, with owners against each one.',
      state: 'review', start_date: D(-16), end_date: D(-2), locked: false
    },
    {
      id: 'blk_11', phase_id: 'ph_6', order_index: 0,
      title: 'Homepage concepts',
      description: 'Two directions for the homepage, desktop and mobile.',
      state: 'todo', start_date: D(4), end_date: D(18), locked: false
    }
  ],

  // TABLE: block_links
  // The files and links a viewer opens from a block. Kept as its own table so a
  // block row stays exactly the shape of the `blocks` table.
  // Later: `url` can point at a Supabase Storage object via a signed URL.
  block_links: [
    { id: 'lnk_1', block_id: 'blk_1', label: 'Positioning brief.pdf', url: 'https://example.com/acme/positioning-brief.pdf', order_index: 0 },
    { id: 'lnk_2', block_id: 'blk_1', label: 'Interview notes', url: 'https://example.com/acme/interviews', order_index: 1 },
    { id: 'lnk_3', block_id: 'blk_3', label: 'Moodboards — 3 directions', url: 'https://example.com/acme/moodboards', order_index: 0 },
    { id: 'lnk_4', block_id: 'blk_4', label: 'Logotype presentation v4', url: 'https://example.com/acme/logotype-v4', order_index: 0 },
    { id: 'lnk_5', block_id: 'blk_4', label: 'Working files (Figma)', url: 'https://example.com/acme/logotype-figma', order_index: 1 },
    { id: 'lnk_6', block_id: 'blk_5', label: 'Colour tokens sheet', url: 'https://example.com/acme/colour-tokens', order_index: 0 },
    { id: 'lnk_7', block_id: 'blk_9', label: 'Sitemap v2', url: 'https://example.com/northwind/sitemap', order_index: 0 },
    { id: 'lnk_8', block_id: 'blk_10', label: 'Content audit sheet', url: 'https://example.com/northwind/audit', order_index: 0 }
  ],

  // TABLE: approvals  (one row per approved block)
  approvals: [
    { id: 'apr_1', block_id: 'blk_1', approved_by: 'u_viewer', approved_at: TS(-59) },
    { id: 'apr_2', block_id: 'blk_2', approved_by: 'u_viewer', approved_at: TS(-43) },
    { id: 'apr_3', block_id: 'blk_3', approved_by: 'u_viewer', approved_at: TS(-25) },
    { id: 'apr_4', block_id: 'blk_9', approved_by: 'u_viewer_2', approved_at: TS(-17) }
  ],

  // TABLE: brand_assets — the contents of a Visual Identity category.
  // kind: 'text' | 'image' | 'file' | 'link'
  //   text  -> title + body
  //   image -> title + url (a data URL here, a Storage object later)
  //   file  -> a download, e.g. the asset pack zip
  //   link  -> somewhere external
  brand_assets: [
    {
      id: 'ba_1', section_id: 'bs_prj_1_logo-system', kind: 'heading', order_index: 0,
      title: 'Clear space', body: null, url: null, file_name: null, file_size: null, size: 'm'
    },
    {
      id: 'ba_1b', section_id: 'bs_prj_1_logo-system', kind: 'paragraph', order_index: 1,
      title: null,
      body: 'Keep clear space around the lockup equal to the height of the mark. Nothing — type, rules, photography — comes inside it.',
      url: null, file_name: null, file_size: null
    },
    {
      id: 'ba_2', section_id: 'bs_prj_1_logo-system', kind: 'image', order_index: 2,
      title: 'Primary lockup',
      body: null,
      url:
        "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='640' height='300'><rect width='640' height='300' fill='%23f2f3f6'/><circle cx='210' cy='150' r='52' fill='%2314161a'/><rect x='292' y='126' width='168' height='18' rx='9' fill='%2314161a'/><rect x='292' y='158' width='104' height='14' rx='7' fill='%239aa0ac'/></svg>",
      file_name: 'acme-primary-lockup.svg', file_size: 412
    },
    {
      id: 'ba_3', section_id: 'bs_prj_1_color-palette', kind: 'heading', order_index: 0,
      title: 'Core palette', body: null, url: null, file_name: null, file_size: null, size: 'm'
    },
    {
      id: 'ba_3b', section_id: 'bs_prj_1_color-palette', kind: 'paragraph', order_index: 1,
      title: null,
      body: 'Ink #14161A carries the brand. Bone #F2F3F6 is the ground it sits on. Everything else is support and never more than a fifth of a layout.',
      url: null, file_name: null, file_size: null
    }
  ],

  // TABLE: brand_sections — Visual Identity's left-hand list, per client.
  // Seeded from the standard templates; an admin adjusts and adds to them.
  brand_sections: [
    ...brandSectionsFor('prj_1'),
    // a client whose system was trimmed to fit the job
    ...brandSectionsFor('prj_2', ['logo-system', 'color-palette', 'typography-system', 'downloadables']),
    ...brandSectionsFor('prj_3')
  ]
})
