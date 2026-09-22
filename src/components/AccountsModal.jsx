import { useMemo, useState } from 'react'
import { useStore } from '../state/store'
import { isLive } from '../services/dataClient'
import ConfirmDialog from './ConfirmDialog'
import { Trash } from './Icons'

/**
 * Admin-only. Who can sign in, and which client each of them lands on.
 *
 * A login cannot be created from the browser — that needs the service_role key,
 * which must never ship in the app. So this writes down who is allowed in and
 * which client they belong to; the person claims it by signing up with that
 * address on the sign-in screen, and a database trigger binds them to the
 * client named here. Invite somebody who already has a login and they are moved
 * on the spot instead.
 */
export default function AccountsModal({ onClose }) {
  const { accounts, invites, projects, activeProjectId, session, actions } = useStore()
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('viewer')
  const [projectId, setProjectId] = useState(activeProjectId)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [sent, setSent] = useState(null)
  const [confirm, setConfirm] = useState(null)

  const projectName = (id) => projects.find((p) => p.id === id)?.name ?? '—'
  const pending = useMemo(() => invites.filter((i) => !i.claimed_at), [invites])

  const submit = async (e) => {
    e.preventDefault()
    if (!email.trim() || busy) return
    setBusy(true)
    setError(null)
    try {
      const row = await actions.inviteUser({
        email: email.trim(),
        role,
        project_id: role === 'admin' ? null : projectId
      })
      setSent({ email: email.trim(), alreadyHadLogin: !!row?.claimed_at })
      setEmail('')
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const act = async (fn) => {
    setError(null)
    try {
      await fn()
    } catch (err) {
      setError(err.message)
    }
    setConfirm(null)
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal modal-wide" onClick={(e) => e.stopPropagation()}>
        <header className="modal-head">
          <div>
            <h3>Accounts</h3>
            <p>A client signs in with their own password and only ever sees the client you put them on.</p>
          </div>
          <button className="ghost-btn" onClick={onClose}>
            Close
          </button>
        </header>

        <form className="account-form" onSubmit={submit}>
          <label>
            <span>Email</span>
            <input
              type="email"
              value={email}
              placeholder="name@company.com"
              onChange={(e) => {
                setEmail(e.target.value)
                setSent(null)
              }}
            />
          </label>
          <label>
            <span>Role</span>
            <select value={role} onChange={(e) => setRole(e.target.value)}>
              <option value="viewer">Client</option>
              <option value="admin">Admin (sees every client)</option>
            </select>
          </label>
          <label>
            <span>Client</span>
            <select
              value={role === 'admin' ? '' : projectId ?? ''}
              disabled={role === 'admin'}
              onChange={(e) => setProjectId(e.target.value)}
            >
              {role === 'admin' && <option value="">All of them</option>}
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" className="primary-btn" disabled={busy}>
            {busy ? 'Adding…' : 'Give access'}
          </button>
        </form>

        {error && <p className="account-error">{error}</p>}

        {sent &&
          (sent.alreadyHadLogin ? (
            <p className="account-note">
              <strong>{sent.email}</strong> already had a login and is now on {role === 'admin' ? 'every client' : projectName(projectId)}.
            </p>
          ) : (
            <p className="account-note">
              Send <strong>{sent.email}</strong> the link to this app. They pick “First time here?” on the sign-in
              screen, set their own password with this exact address, and land on{' '}
              {role === 'admin' ? 'every client' : projectName(projectId)}.
            </p>
          ))}

        {pending.length > 0 && (
          <section className="account-section">
            <h4>Waiting to sign up</h4>
            {pending.map((i) => (
              <div key={i.id} className="account-row">
                <span className="account-email">{i.email}</span>
                <span className="pill pill-quiet">{i.role === 'admin' ? 'admin' : projectName(i.project_id)}</span>
                <button
                  className="icon-btn"
                  title="Withdraw this invite"
                  onClick={() => setConfirm({ kind: 'invite', id: i.id, label: i.email })}
                >
                  <Trash width="14" height="14" />
                </button>
              </div>
            ))}
          </section>
        )}

        <section className="account-section">
          <h4>Can sign in</h4>
          {accounts.map((u) => (
            <div key={u.id} className="account-row">
              <span className="account-email">
                {u.email}
                {u.id === session?.id && <span className="account-you">you</span>}
              </span>
              <span className={`pill ${u.role === 'admin' ? '' : 'pill-quiet'}`}>
                {u.role === 'admin' ? 'admin · every client' : projectName(u.project_id)}
              </span>
              <button
                className="icon-btn"
                title="Take access away"
                disabled={u.id === session?.id}
                onClick={() => setConfirm({ kind: 'user', id: u.id, label: u.email })}
              >
                <Trash width="14" height="14" />
              </button>
            </div>
          ))}
        </section>

        {!isLive && (
          <p className="stub-note">
            No backend configured, so this is local demo data — there is nothing to sign in to.
          </p>
        )}
      </div>

      {confirm && (
        <ConfirmDialog
          title={confirm.kind === 'invite' ? 'Withdraw this invite?' : 'Take access away?'}
          body={
            confirm.kind === 'invite'
              ? `${confirm.label} will not be able to claim it.`
              : `${confirm.label} keeps their password but sees nothing until you add them again.`
          }
          confirmLabel={confirm.kind === 'invite' ? 'Withdraw' : 'Take away'}
          onCancel={() => setConfirm(null)}
          onConfirm={() =>
            act(() =>
              confirm.kind === 'invite' ? actions.cancelInvite(confirm.id) : actions.revokeAccess(confirm.id)
            )
          }
        />
      )}
    </div>
  )
}
