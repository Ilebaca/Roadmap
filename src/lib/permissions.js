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

/** Create blocks / phases, edit them, set dates, drag-resize, set states. */
export const canCreate = (session) => isAdmin(session)
export const canEditBlock = (session, block) => isAdmin(session) && !block.locked
export const canSetState = (session, block) => isAdmin(session) && !block.locked
export const canResize = (session, block) => isAdmin(session) && !block.locked

/** Only an admin can withdraw an approval, which unlocks the block again. */
export const canUnapprove = (session, block) => isAdmin(session) && block.state === 'approved'

/** Approve is open to viewer AND admin, but only while the block is in Review. */
export const canApprove = (session, block) => !!session && block.state === 'review' && !block.locked

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
