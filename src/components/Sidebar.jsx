import { useState } from 'react'
import { useStore } from '../state/store'
import { canCreate } from '../lib/permissions'
import { Check, Lock, Plus } from './Icons'

/** Left rail: one tab per phase, dependency-gated. */
export default function Sidebar() {
  const { session, project, phases, gates, activePhaseId, actions } = useStore()
  const [adding, setAdding] = useState(false)
  const [title, setTitle] = useState('')
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
        <span className="eyebrow">Project</span>
        <h2>{project?.name ?? '—'}</h2>
      </div>

      <nav className="phase-list">
        {phases.map((phase, i) => {
          const gate = gates[phase.id] ?? {}
          const active = phase.id === activePhaseId
          return (
            <button
              key={phase.id}
              className={`phase-tab ${active ? 'is-active' : ''} ${gate.unlocked ? '' : 'is-locked'} ${gate.complete ? 'is-complete' : ''}`}
              onClick={() => gate.unlocked && actions.selectPhase(phase.id)}
              disabled={!gate.unlocked}
              title={gate.unlocked ? phase.title : 'Locked until the previous phase is fully approved'}
            >
              <span className="phase-index">{String(i + 1).padStart(2, '0')}</span>
              <span className="phase-body">
                <span className="phase-title">{phase.title}</span>
                <span className="phase-meta">
                  {gate.unlocked
                    ? gate.total
                      ? `${gate.approvedCount}/${gate.total} approved`
                      : 'No blocks yet'
                    : 'Locked'}
                </span>
                {gate.unlocked && gate.total > 0 && (
                  <span className="progress">
                    <span style={{ width: `${(gate.approvedCount / gate.total) * 100}%` }} />
                  </span>
                )}
              </span>
              <span className="phase-status">
                {!gate.unlocked && <Lock width="14" height="14" />}
                {gate.unlocked && gate.complete && <Check width="14" height="14" />}
              </span>
            </button>
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

      <p className="sidebar-foot">
        A phase unlocks only when every block in the phase before it is approved.
      </p>
    </aside>
  )
}
