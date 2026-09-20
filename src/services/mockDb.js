/**
 * MOCK DATABASE
 * -----------------------------------------------------------------------------
 * Every object below is shaped exactly like the Postgres row it will become in
 * Supabase. Same table names, same column names, same types. When the backend is
 * wired in, this file is deleted and `dataClient.js` swaps local reads/writes for
 * Supabase queries -- nothing else in the app changes.
 *
 * Tables: users, projects, phases, blocks, block_links, approvals
 * Relationships: project 1-N phases, phase 1-N blocks, block 1-N links,
 * block 0..1 approval.
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
  projects: [
    { id: 'prj_1', name: 'Acme — Brand Platform', created_by: 'u_admin' },
    { id: 'prj_2', name: 'Northwind — Site Refresh', created_by: 'u_admin' }
  ],

  // TABLE: phases  (order_index drives sidebar order AND the dependency chain)
  phases: [
    { id: 'ph_1', project_id: 'prj_1', title: 'Discovery', order_index: 0 },
    { id: 'ph_2', project_id: 'prj_1', title: 'Concept & Design', order_index: 1 },
    { id: 'ph_3', project_id: 'prj_1', title: 'Production', order_index: 2 },
    { id: 'ph_4', project_id: 'prj_1', title: 'Launch', order_index: 3 },
    { id: 'ph_5', project_id: 'prj_2', title: 'Kickoff', order_index: 0 }
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
    { id: 'lnk_6', block_id: 'blk_5', label: 'Colour tokens sheet', url: 'https://example.com/acme/colour-tokens', order_index: 0 }
  ],

  // TABLE: approvals  (one row per approved block)
  approvals: [
    { id: 'apr_1', block_id: 'blk_1', approved_by: 'u_viewer', approved_at: TS(-59) },
    { id: 'apr_2', block_id: 'blk_2', approved_by: 'u_viewer', approved_at: TS(-43) },
    { id: 'apr_3', block_id: 'blk_3', approved_by: 'u_viewer', approved_at: TS(-25) }
  ]
})
