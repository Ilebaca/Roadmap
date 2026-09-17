import { useState } from 'react'
import { StoreProvider, useStore } from './state/store'
import Sidebar from './components/Sidebar'
import Timeline from './components/Timeline'
import AccountsModal from './components/AccountsModal'
import { canManageAccounts } from './lib/permissions'
import { Users } from './components/Icons'

export default function App() {
  return (
    <StoreProvider>
      <Shell />
    </StoreProvider>
  )
}

function Shell() {
  const { session, accounts, loading, error, actions } = useStore()
  const [accountsOpen, setAccountsOpen] = useState(false)

  if (loading || !session) {
    return (
      <div className="app-frame">
        <div className="booting">Loading roadmap…</div>
      </div>
    )
  }

  return (
    <div className="app-frame">
      <header className="topbar">
        <div className="brand">
          <span className="brand-dot" />
          Roadmap
        </div>

        <div className="topbar-right">
          {canManageAccounts(session) && (
            <button className="ghost-btn" onClick={() => setAccountsOpen(true)}>
              <Users width="15" height="15" /> Accounts
            </button>
          )}

          {/* ---------------------------------------------------------------
              TEMPORARY DEV TOGGLE — remove once real auth lands.
              BACKEND: the signed-in user comes from supabase.auth, not a picker.
             --------------------------------------------------------------- */}
          <div className="dev-switch">
            <span className="dev-tag">DEV</span>
            <div className="role-toggle">
              {['admin', 'viewer'].map((role) => {
                const user = accounts.find((u) => u.role === role && u.project_id === session.project_id)
                return (
                  <button
                    key={role}
                    className={session.role === role ? 'is-on' : ''}
                    disabled={!user}
                    onClick={() => user && actions.switchUser(user.id)}
                  >
                    {role === 'admin' ? 'Admin' : 'Viewer'}
                  </button>
                )
              })}
            </div>
            <span className="dev-email">{session.email}</span>
            <button className="ghost-btn subtle" onClick={actions.resetMockData} title="Restore the seeded mock data">
              Reset data
            </button>
          </div>
        </div>
      </header>

      <div className="workspace">
        <Sidebar />
        <main className="stage">
          <Timeline />
        </main>
      </div>

      {error && <div className="toast">{error}</div>}
      {accountsOpen && <AccountsModal onClose={() => setAccountsOpen(false)} />}
    </div>
  )
}
