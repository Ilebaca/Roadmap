import { useState } from 'react'
import { StoreProvider, useStore } from './state/store'
import Sidebar from './components/Sidebar'
import Timeline from './components/Timeline'
import AccountsModal from './components/AccountsModal'
import AppRail from './components/AppRail'
import BrandDelivery from './components/BrandDelivery'
import ClientSwitcher from './components/ClientSwitcher'
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
  const [app, setApp] = useState('roadmap') // which icon on the rail is lit

  if (loading || !session) {
    return (
      <div className="app-frame">
        <div className="booting">Loading…</div>
      </div>
    )
  }

  return (
    <div className="app-frame">
      <header className="topbar">
        {/* The client this account is looking at. An admin picks between
            their clients here; a viewer only ever sees their own. */}
        <ClientSwitcher />

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
                const user = accounts.find((u) => u.role === role) || null
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

      {/* The icon rail sits with the left-hand list, not out at the window
          edge — same top, same bottom, one unit. */}
      <div className="workspace">
        <AppRail active={app} onSelect={setApp} />
        {app === 'roadmap' ? (
          <>
            <Sidebar />
            <main className="stage">
              <Timeline />
            </main>
          </>
        ) : (
          <BrandDelivery />
        )}
      </div>

      {error && <div className="toast">{error}</div>}
      {accountsOpen && <AccountsModal onClose={() => setAccountsOpen(false)} />}
    </div>
  )
}
