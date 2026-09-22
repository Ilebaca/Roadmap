import { useEffect, useRef, useState } from 'react'
import { useStore } from '../state/store'
import { isAdmin } from '../lib/permissions'
import { Check, Chevron } from './Icons'

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
  const wrapRef = useRef(null)

  const canSwitch = isAdmin(session) && projects.length > 1

  useEffect(() => {
    if (!open) return
    const onDown = (e) => !wrapRef.current?.contains(e.target) && setOpen(false)
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
        <Logo project={project} />
        <span className="client-name">{project?.name ?? '—'}</span>
      </div>
    )
  }

  return (
    <div className="client-id-wrap" ref={wrapRef}>
      <button className={`client-id is-button ${open ? 'is-open' : ''}`} onClick={() => setOpen((o) => !o)} aria-haspopup="listbox" aria-expanded={open}>
        <Logo project={project} />
        <span className="client-name">{project?.name ?? '—'}</span>
        <Chevron width="13" height="13" className="client-caret" />
      </button>

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
              {p.id === activeProjectId && <Check width="13" height="13" />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
