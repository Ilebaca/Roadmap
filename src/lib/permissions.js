/**
 * One place for "who can do what". The rules here are mirrored by the data layer
 * and, later, by Supabase row-level security. The UI uses these to hide or
 * disable controls; the enforcement that actually matters happens server-side.
 */

export const STATES = [
  { value: 'todo', label: 'To Do' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'on_hold', label: 'On Hold' },
  { value: 'review', label: 'Review' },
  { value: 'approved', label: 'Approved' }
]

/** States an admin may pick in the selector. 'approved' is never chosen —
 *  it is the *result* of somebody clicking Approve. */
export const SELECTABLE_STATES = STATES.filter((s) => s.value !== 'approved')

export const stateLabel = (v) => STATES.find((s) => s.value === v)?.label ?? v

export const isAdmin = (session) => session?.role === 'admin'

/** Create blocks / phases, edit them, set dates, drag-resize. */
export const canCreate = (session) => isAdmin(session)
export const canEditBlock = (session, block) => isAdmin(session) && !block.locked
export const canResize = (session, block) => isAdmin(session) && !block.locked

/**
 * One block at a time.
 * ---------------------------------------------------------------------------
 * A roadmap is a queue, not a board: the work runs in order, one job is live,
 * and finishing it is what starts the next. So a block is in exactly one of
 * three places.
 *
 *   past    approved, and behind the live one. Done with.
 *   active  the first block that is not approved. The only one that moves.
 *   future  everything after it. Locked until its turn comes.
 *
 * Nothing is stored for this — it falls out of which blocks are approved, so
 * it cannot drift from the truth or need repairing. Approving the live block
 * makes the next one live by arithmetic alone.
 *
 * Content is a separate question. An admin plans the whole roadmap, so titles,
 * dates, descriptions and links stay editable on any block; it is only the
 * *progress* of the work that is one-at-a-time, for admin and client alike.
 * Otherwise "one task is active" would be true of what the client sees and
 * false of what the database holds.
 */
export function orderedBlocks(phases, blocks) {
  // The same order the timeline draws in, so the queue matches the picture.
  const rank = new Map([...phases].sort((a, b) => a.order_index - b.order_index).map((p, i) => [p.id, i]))
  return [...blocks].sort(
    (a, b) =>
      (rank.get(a.phase_id) ?? 0) - (rank.get(b.phase_id) ?? 0) ||
      a.start_date.localeCompare(b.start_date) ||
      a.order_index - b.order_index
  )
}

/** { [blockId]: 'past' | 'active' | 'future' } */
export function computeBlockGates(phases, blocks) {
  const ordered = orderedBlocks(phases, blocks)
  // Approved is approved wherever it sits: a block signed off out of turn is
  // still done, and must not come back wearing a lock.
  const live = ordered.findIndex((b) => b.state !== 'approved')
  const out = {}
  ordered.forEach((b, i) => {
    out[b.id] = b.state === 'approved' ? 'past' : i === live ? 'active' : 'future'
  })
  return out
}

/** Only the live block's state moves. */
export const canSetState = (session, block, standing) =>
  isAdmin(session) && !block.locked && standing === 'active'

/** Only an admin can withdraw an approval, which unlocks the block again. */
export const canUnapprove = (session, block) => isAdmin(session) && block.state === 'approved'

/**
 * Approve is open to viewer AND admin, but only on the live block and only
 * while it is in Review — Review IS the approval request.
 */
export const canApprove = (session, block, standing) =>
  !!session && block.state === 'review' && !block.locked && standing === 'active'

/** Stub account creation is admin-only. */
export const canManageAccounts = (session) => isAdmin(session)

/** A phase is complete when it has blocks and every one of them is approved. */
export const isPhaseComplete = (blocks) =>
  blocks.length > 0 && blocks.every((b) => b.state === 'approved')

/**
 * Dependency gate: a phase is enterable only once every earlier phase is
 * complete. That gate is what the CLIENT sees — it is how the work is released
 * to them. The admin plans the whole project, so nothing is ever gated for
 * them: pass `unlockAll` and every phase opens, while `complete` and the counts
 * still report the real state so the admin can see how far the client has got.
 *
 * Returns { [phaseId]: { unlocked, complete, approvedCount, total, gated } }
 * where `gated` is true when this phase would be locked for a viewer.
 */
export function computePhaseGates(phases, blocks, { unlockAll = false } = {}) {
  const out = {}
  let previousComplete = true
  for (const phase of [...phases].sort((a, b) => a.order_index - b.order_index)) {
    const mine = blocks.filter((b) => b.phase_id === phase.id)
    const approvedCount = mine.filter((b) => b.state === 'approved').length
    const complete = isPhaseComplete(mine)
    out[phase.id] = {
      unlocked: unlockAll || previousComplete,
      gated: !previousComplete,
      complete,
      approvedCount,
      total: mine.length
    }
    previousComplete = previousComplete && complete
  }
  return out
}
