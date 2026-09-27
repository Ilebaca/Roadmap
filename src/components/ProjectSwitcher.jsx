import { useEffect, useRef, useState } from 'react'
import { useStore } from '../state/store'
import { canCreate } from '../lib/permissions'
import { eventInside } from '../lib/dom'
import { Check, Chevron, Plus, Trash } from './Icons'
import ConfirmDialog from './ConfirmDialog'

/**
 * Which of this client's roadmaps is on screen.
 *
 * A client runs several jobs at once and each has its own run of phases, so
 * the head of the strip names the one being looked at rather than saying
 * "Phases". An admin switches between them, renames one in place, starts
 * another, or removes one along with everything in it. A client sees the name
 * and the list, and cannot change any of it.
 */
export default function ProjectSwitcher() {
  const { session, roadmaps, activeRoadmapId, phases, blocks, actions } = useStore()
  const [open, setOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [draft, setDraft] = useState('')
  const [pending, setPending] = useState(null)
  const wrapRef = useRef(null)

  const admin = canCreate(session)
  const current = roadmaps.find((r) => r.id === activeRoadmapId) ?? null

  useEffect(() => setDraft(current?.name ?? ''), [current?.id, current?.name])

  useEffect(() => {
    if (!open) return setCreating(false)
    const onDown = (e) => !eventInside(wrapRef.current, e) && setOpen(false)
    const onKey = (e) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('pointerdown', onDown, true)
    window.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown, true)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  const commitName = () => {
    const clean = draft.trim()
    if (!clean || clean === current?.name) return setDraft(current?.name ?? '')
    actions.renameRoadmap(current.id, clean)
  }

  const submit = async (e) => {
    e.preventDefault()
    const clean = name.trim()
    if (!clean) return
    setName('')
    setCreating(false)
    setOpen(false)
    await actions.createRoadmap(clean)
  }

  // What a delete would take with it, said plainly before it happens.
  const toll = (roadmap) => {
    if (roadmap.id !== activeRoadmapId) return 'Everything in it goes too.'
    const n = phases.length
    const b = blocks.length
    if (!n) return 'It is empty.'
    return `Its ${n} phase${n > 1 ? 's' : ''} and ${b} block${b === 1 ? '' : 's'} go with it.`
  }

  if (!admin) {
    return (
      <div className="project-switch">
        <span className="eyebrow">Project</span>
        <span className="project-name">{current?.name ?? 'No project yet'}</span>
      </div>
    )
  }

  return (
    <div className="project-switch is-admin" ref={wrapRef}>
      <span className="eyebrow">Project</span>
      <div className="project-row">
        {/* The name itself is the rename field; the chevron opens the list. */}
        <input
          className="project-name-input"
          value={draft}
          placeholder="Project name"
          title="Click to rename this project"
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commitName}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur()
            if (e.key === 'Escape') {
              setDraft(current?.name ?? '')
              e.currentTarget.blur()
            }
          }}
        />
        <button
          className="project-caret"
          onClick={() => setOpen((o) => !o)}
          title="Switch project"
          aria-haspopup="listbox"
          aria-expanded={open}
        >
          <Chevron width="13" height="13" />
        </button>
      </div>

      {open && (
        <div className="project-menu" role="listbox">
          {roadmaps.map((r) => (
            <div key={r.id} className="project-option-row">
              <button
                className={`project-option ${r.id === activeRoadmapId ? 'is-current' : ''}`}
                onClick={() => {
                  actions.selectRoadmap(r.id)
                  setOpen(false)
                }}
                role="option"
                aria-selected={r.id === activeRoadmapId}
              >
                {r.id === activeRoadmapId && <Check width="13" height="13" />}
                <span>{r.name}</span>
              </button>
              {/* The last one cannot go: there would be nothing to show. */}
              {roadmaps.length > 1 && (
                <button
                  className="icon-btn danger"
                  title={`Delete ${r.name} and everything in it`}
                  onClick={() => setPending(r)}
                >
                  <Trash width="13" height="13" />
                </button>
              )}
            </div>
          ))}

          {creating ? (
            <form className="project-new" onSubmit={submit}>
              <input
                autoFocus
                value={name}
                placeholder="New project name"
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === 'Escape' && setCreating(false)}
              />
              <button type="submit">Add</button>
            </form>
          ) : (
            <button className="project-add" onClick={() => setCreating(true)}>
              <Plus width="13" height="13" /> New project
            </button>
          )}
        </div>
      )}

      {pending && (
        <ConfirmDialog
          title={`Delete “${pending.name}”?`}
          body={`${toll(pending)} This cannot be undone.`}
          confirmLabel="Delete project"
          onCancel={() => setPending(null)}
          onConfirm={async () => {
            const id = pending.id
            setPending(null)
            setOpen(false)
            await actions.deleteRoadmap(id)
          }}
        />
      )}
    </div>
  )
}
