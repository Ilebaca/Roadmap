import { useEffect, useRef, useState } from 'react'
import { useStore } from '../state/store'
import { isAdmin } from '../lib/permissions'
import { Chevron, Plus } from './Icons'
import { eventInside } from '../lib/dom'

/** Initials fallback until a real logo is uploaded. */
const initials = (name = '') =>
  name
    .replace(/[^\p{L}\p{N} ]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('')

function Logo({ project, size = 30 }) {
  // BACKEND: `projects.logo_url` points at a Supabase Storage object; until one
  // is uploaded the client's initials stand in.
  if (project?.logo_url) {
    return <img className="client-logo" src={project.logo_url} alt="" width={size} height={size} />
  }
  return (
    <span className="client-logo" style={{ width: size, height: size }} aria-hidden="true">
      {initials(project?.name)}
    </span>
  )
}

/**
 * Top-left identity. An admin runs several clients and picks between them; a
 * viewer is bound to one, so they just see their own logo and name.
 */
export default function ClientSwitcher() {
  const { session, project, projects, activeProjectId, actions } = useStore()
  const [open, setOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [draft, setDraft] = useState('') // the client name being typed over
  const wrapRef = useRef(null)

  // An admin can always open the menu — it is also where a new client starts.
  const canSwitch = isAdmin(session)
  // `project` lags by one fetch while a client loads; the list already has the
  // name, so the brand is never shown as a placeholder dash.
  const shown = project ?? projects.find((p) => p.id === activeProjectId) ?? null

  // Keep the rename field in step with whichever client is open.
  useEffect(() => setDraft(shown?.name ?? ''), [shown?.id, shown?.name])

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

  if (!canSwitch) {
    return (
      <div className="client-id">
        <Logo project={shown} />
        <span className="client-name">{shown?.name ?? ''}</span>
      </div>
    )
  }

  const submit = async (e) => {
    e.preventDefault()
    const clean = name.trim()
    if (!clean) return
    setName('')
    setCreating(false)
    setOpen(false)
    await actions.createProject(clean)
  }

  const commitName = () => {
    const clean = draft.trim()
    if (!clean || clean === shown?.name) return setDraft(shown?.name ?? '')
    actions.renameProject(shown.id, clean)
  }

  return (
    <div className="client-id-wrap" ref={wrapRef}>
      <div className={`client-id is-button ${open ? 'is-open' : ''}`}>
        {/* The logo and the chevron open the client list; the name itself is
            the rename field. Admin only — a viewer never gets here. */}
        <button className="client-logo-btn" onClick={() => setOpen((o) => !o)} title="Switch client" aria-haspopup="listbox" aria-expanded={open}>
          <Logo project={shown} />
        </button>
        <input
          className="client-name-input"
          value={draft}
          placeholder="Client name"
          title="Click to rename this client"
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commitName}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur()
            if (e.key === 'Escape') {
              setDraft(shown?.name ?? '')
              e.currentTarget.blur()
            }
          }}
        />
        <button className="client-caret-btn" onClick={() => setOpen((o) => !o)} title="Switch client" aria-label="Switch client">
          <Chevron width="13" height="13" className="client-caret" />
        </button>
      </div>

      {open && (
        <div className="client-menu" role="listbox">
          <span className="client-menu-label">Clients</span>
          {projects.map((p) => (
            <button
              key={p.id}
              role="option"
              aria-selected={p.id === activeProjectId}
              className={`client-option ${p.id === activeProjectId ? 'is-current' : ''}`}
              onClick={() => {
                setOpen(false)
                actions.selectProject(p.id)
              }}
            >
              <Logo project={p} size={26} />
              <span>{p.name}</span>
            </button>
          ))}

          {creating ? (
            <form className="client-new-form" onSubmit={submit}>
              <input
                autoFocus
                value={name}
                placeholder="Client name"
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === 'Escape' && setCreating(false)}
              />
              <button type="submit">Create</button>
            </form>
          ) : (
            <button className="client-new" onClick={() => setCreating(true)}>
              <Plus width="13" height="13" /> New client
            </button>
          )}
        </div>
      )}
    </div>
  )
}
