import { useState } from 'react'
import { useStore } from '../state/store'

/**
 * Admin-only account creation — STUB UI.
 * BACKEND: creating an auth user cannot happen from the browser with an anon
 * key. This form will post to an edge function / server route that calls
 * supabase.auth.admin.createUser(), then inserts the `users` row with role and
 * project_id. Until then it just appends to the mock users table.
 */
export default function AccountsModal({ onClose }) {
  const { accounts, project, activeProjectId, session, actions } = useStore()
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('viewer')
  const [done, setDone] = useState(null)

  const submit = async (e) => {
    e.preventDefault()
    if (!email.trim()) return
    await actions.createAccount({ email: email.trim(), role, project_id: activeProjectId })
    setDone(email.trim())
    setEmail('')
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <header className="modal-head">
          <div>
            <h3>Accounts</h3>
            <p>Each viewer is bound to one project and sees only that project.</p>
          </div>
          <button className="ghost-btn" onClick={onClose}>
            Close
          </button>
        </header>

        <form className="account-form" onSubmit={submit}>
          <label>
            <span>Email</span>
            <input type="email" value={email} placeholder="name@company.com" onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label>
            <span>Role</span>
            <select value={role} onChange={(e) => setRole(e.target.value)}>
              <option value="viewer">Viewer</option>
              <option value="admin">Admin</option>
            </select>
          </label>
          <label>
            <span>Project</span>
            <input value={project?.name ?? ''} readOnly />
          </label>
          <button type="submit" className="primary-btn">
            Create account
          </button>
        </form>

        {done && <p className="stub-note">Stubbed: “{done}” added to local mock data only — no invite email was sent.</p>}

        <div className="account-list">
          {accounts.map((u) => (
            <div key={u.id} className="account-row">
              <span className="account-email">{u.email}</span>
              <span className={`pill ${u.role === 'admin' ? '' : 'pill-quiet'}`}>{u.role}</span>
              <span className="account-project">{u.project_id}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
