import { useState } from 'react'
import { useStore } from '../state/store'
import { canCreate } from '../lib/permissions'
import { Check, Lock, Plus, Trash } from './Icons'
import ConfirmDialog from './ConfirmDialog'
import ProjectSwitcher from './ProjectSwitcher'
import { useHoldDrag } from '../lib/useHoldDrag'

/** Left rail: one tab per phase, dependency-gated. */
export default function Sidebar() {
  const { session, phases, gates, activePhaseId, livePhaseId, actions } = useStore()
  const [adding, setAdding] = useState(false)
  const [title, setTitle] = useState('')
  const [pending, setPending] = useState(null) // phase waiting on a confirm
  const admin = canCreate(session)

  const submit = (e) => {
    e.preventDefault()
    const t = title.trim()
    if (!t) return
    actions.createPhase(t)
    setTitle('')
    setAdding(false)
  }

  return (
    <aside className="sidebar">
      <div className="sidebar-head">
        {/* The head of the strip names the roadmap on screen, not "Phases" —
            the phases are the pills beside it. */}
        <ProjectSwitcher />
      </div>

      {/* The plus and the phases are one run: at the head of it, on the same
          line, not a row of its own above them. */}
      <div className="phase-strip">
        {admin &&
          (adding ? (
            <form className="add-phase" onSubmit={submit}>
              <input
                autoFocus
                value={title}
                placeholder="Phase name"
                onChange={(e) => setTitle(e.target.value)}
                onBlur={() => !title && setAdding(false)}
              />
              <button type="submit">Add</button>
            </form>
          ) : (
            <button
              className="add-phase-btn is-plus"
              onClick={() => setAdding(true)}
              title="New phase"
              aria-label="New phase"
            >
              <Plus width="16" height="16" />
            </button>
          ))}

        <nav className="phase-list">
          {phases.map((phase, i) => (
            <PhaseTab
              key={phase.id}
              phase={phase}
              index={i}
              gate={gates[phase.id] ?? {}}
              active={phase.id === activePhaseId}
              live={phase.id === livePhaseId}
              admin={admin}
              onSelect={() => actions.selectPhase(phase.id)}
              onAskDelete={() => setPending({ phase, blocks: gates[phase.id]?.total ?? 0 })}
            />
          ))}
        </nav>
      </div>

      {pending && (
        <ConfirmDialog
          title={`Delete "${pending.phase.title}"?`}
          body={
            pending.blocks
              ? `Its ${pending.blocks} block${pending.blocks > 1 ? 's' : ''} go with it, along with their links and approvals. This cannot be undone.`
              : 'This cannot be undone.'
          }
          confirmLabel="Delete phase"
          onCancel={() => setPending(null)}
          onConfirm={() => {
            actions.removePhase(pending.phase.id)
            setPending(null)
          }}
        />
      )}

      <p className="sidebar-foot">
        {admin
          ? 'You can open and plan any phase. The client only sees a phase once every block in the one before it is approved.'
          : 'A phase unlocks only when every block in the phase before it is approved.'}
      </p>
    </aside>
  )
}

/**
 * One phase on the strip.
 *
 * Its own component so the hold-to-delete hook has somewhere stable to live:
 * called inside the map it would be a different number of hooks every time a
 * phase was added or removed.
 */
function PhaseTab({ phase, index, gate, active, live, admin, onSelect, onAskDelete }) {
  // Hold the pill to be asked about deleting it. Phases keep their order, so
  // a hold that turns into a drag is a finger changing its mind: it picks the
  // pill up, and letting go puts it back without asking anything.
  const { holding, handlers } = useHoldDrag({ onRelease: (moved) => !moved && onAskDelete() })

  return (
    <div className="cat-row">
      <button
        className={`phase-tab ${active ? 'is-active' : ''} ${gate.unlocked ? '' : 'is-locked'} ${gate.complete ? 'is-complete' : ''} ${holding ? 'is-holding' : ''}`}
        {...(admin ? handlers : null)}
        onClick={() => gate.unlocked && onSelect()}
        disabled={!gate.unlocked}
        title={
          gate.unlocked
            ? gate.gated
              ? `${phase.title} — hidden from the client until the previous phase is approved`
              : phase.title
            : 'Locked until the previous phase is fully approved'
        }
      >
        {/* Where the work is now. The filled pill says which phase you are
            looking at; this says which one is live, and they are often not
            the same. */}
        {live && <span className="phase-live" title="The work is here now" aria-label="Current phase" />}
        <span className="phase-index">{String(index + 1).padStart(2, '0')}</span>
        <span className="phase-body">
          <span className="phase-title">{phase.title}</span>
          <span className="phase-meta">
            {!gate.unlocked
              ? 'Locked'
              : gate.total
                ? `${gate.approvedCount}/${gate.total} approved${gate.gated ? ' · not released' : ''}`
                : `No blocks yet${gate.gated ? ' · not released' : ''}`}
          </span>
          {/* Always drawn, even for a phase with nothing in it yet: the row of
              bars read together is the shape of the whole job, and a gap in it
              would read as a phase with no progress rather than one with no
              work planned. */}
          <span className="progress">
            <span style={{ width: gate.total ? `${(gate.approvedCount / gate.total) * 100}%` : 0 }} />
          </span>
        </span>
        <span className="phase-status">
          {!gate.unlocked && <Lock width="14" height="14" />}
          {gate.unlocked && gate.gated && <Lock width="13" height="13" className="gate-hint" />}
          {gate.unlocked && gate.complete && <Check width="14" height="14" />}
        </span>
      </button>

      {/* On a pointer, the bin. On touch it is hidden and the same question
          comes from holding the pill instead — there is no room beside a
          label for a button that can never be revealed. */}
      {admin && (
        <button
          className="icon-btn danger cat-remove"
          onClick={onAskDelete}
          title={`Delete ${phase.title}${gate.total ? ` and its ${gate.total} block${gate.total > 1 ? 's' : ''}` : ''}`}
        >
          <Trash width="13" height="13" />
        </button>
      )}
    </div>
  )
}
