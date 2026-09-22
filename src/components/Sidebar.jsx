import { useState } from 'react'
import { useStore } from '../state/store'
import { canCreate } from '../lib/permissions'
import { Check, Lock, Plus, Trash } from './Icons'
import ConfirmDialog from './ConfirmDialog'

/** Left rail: one tab per phase, dependency-gated. */
export default function Sidebar() {
  const { session, phases, gates, activePhaseId, actions } = useStore()
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
        <span className="eyebrow">Roadmap</span>
        <h2>Phases</h2>
      </div>

      <nav className="phase-list">
        {phases.map((phase, i) => {
          const gate = gates[phase.id] ?? {}
          const active = phase.id === activePhaseId
          return (
            <div key={phase.id} className="cat-row">
            <button
              className={`phase-tab ${active ? 'is-active' : ''} ${gate.unlocked ? '' : 'is-locked'} ${gate.complete ? 'is-complete' : ''}`}
              onClick={() => gate.unlocked && actions.selectPhase(phase.id)}
              disabled={!gate.unlocked}
              title={
                gate.unlocked
                  ? gate.gated
                    ? `${phase.title} — hidden from the client until the previous phase is approved`
                    : phase.title
                  : 'Locked until the previous phase is fully approved'
              }
            >
              <span className="phase-index">{String(i + 1).padStart(2, '0')}</span>
              <span className="phase-body">
                <span className="phase-title">{phase.title}</span>
                <span className="phase-meta">
                  {!gate.unlocked
                    ? 'Locked'
                    : gate.total
                      ? `${gate.approvedCount}/${gate.total} approved${gate.gated ? ' · not released' : ''}`
                      : `No blocks yet${gate.gated ? ' · not released' : ''}`}
                </span>
                {gate.unlocked && gate.total > 0 && (
                  <span className="progress">
                    <span style={{ width: `${(gate.approvedCount / gate.total) * 100}%` }} />
                  </span>
                )}
              </span>
              <span className="phase-status">
                {!gate.unlocked && <Lock width="14" height="14" />}
                {gate.unlocked && gate.gated && <Lock width="13" height="13" className="gate-hint" />}
                {gate.unlocked && gate.complete && <Check width="14" height="14" />}
              </span>
            </button>
            {/* Same as a Visual Identity category: hover, trash, gone — along
                with every block inside it. */}
            {admin && (
              <button
                className="icon-btn danger cat-remove"
                onClick={() => setPending({ phase, blocks: gate.total ?? 0 })}
                title={`Delete ${phase.title}${gate.total ? ` and its ${gate.total} block${gate.total > 1 ? 's' : ''}` : ''}`}
              >
                <Trash width="13" height="13" />
              </button>
            )}
            </div>
          )
        })}
      </nav>

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
          <button className="add-phase-btn" onClick={() => setAdding(true)}>
            <Plus width="14" height="14" /> New phase
          </button>
        ))}

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
