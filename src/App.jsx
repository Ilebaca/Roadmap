import { useEffect, useState } from 'react'
import { StoreProvider, useStore } from './state/store'
import Sidebar from './components/Sidebar'
import Timeline from './components/Timeline'
import AccountsModal from './components/AccountsModal'
import AppRail from './components/AppRail'
import BrandDelivery from './components/BrandDelivery'
import ClientSwitcher from './components/ClientSwitcher'
import SignIn from './components/SignIn'
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
  const { session, accounts, loading, error, authReady, isLive, actions } = useStore()
  const [accountsOpen, setAccountsOpen] = useState(false)
  const [app, setApp] = useState('roadmap') // which icon on the rail is lit

  // On a phone there is no room for a list down one side and content beside
  // it — Visual Identity's categories squeeze its text to a word a line. Both
  // apps stack there, which is the layout the roadmap already uses, so they
  // share it rather than growing a second one.
  const [narrow, setNarrow] = useState(
    () => typeof window !== 'undefined' && window.innerWidth < 640
  )
  useEffect(() => {
    const onResize = () => setNarrow(window.innerWidth < 640)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  // With a real backend behind it, no session means nobody is signed in.
  if (isLive && authReady && !session) {
    return (
      <>
        <SignIn />
        {error && <div className="toast">{error}</div>}
      </>
    )
  }

  // Signed in with no row in `users`: an uninvited signup, or somebody whose
  // access was taken away. Every policy refuses them, so there is no project to
  // show — say so instead of spinning.
  if (session?.pending) {
    return (
      <div className="signin-frame">
        <div className="signin">
          <span className="brand-dot" />
          <h1>No access yet</h1>
          <p>
            You are signed in as <strong>{session.email}</strong>, but this address has not been given access to a
            client. Ask the studio to add it, then sign in again.
          </p>
          <button className="ghost-btn" onClick={() => actions.signOut()}>
            Sign out
          </button>
        </div>
      </div>
    )
  }

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
            <button
              className="ghost-btn accounts-btn"
              onClick={() => setAccountsOpen(true)}
              title="Accounts"
              aria-label="Accounts"
            >
              <Users width="15" height="15" />
              {/* Wrapped so a narrow screen can drop the word and keep the
                  icon, rather than the button wrapping to its own line. */}
              <span className="btn-label">Accounts</span>
            </button>
          )}

          {/* Signed in for real: no pretending to be someone else. */}
          {isLive ? (
            <div className="who">
              <span className="dev-email">{session.email}</span>
              <button className="ghost-btn subtle" onClick={actions.signOut}>
                Sign out
              </button>
            </div>
          ) : (
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
          )}
        </div>
      </header>

      {/* The icon rail sits with the left-hand list, not out at the window
          edge — same top, same bottom, one unit. */}
      {/* The date line runs across the page, so a column of phases down the
          left would eat the width it needs: they go on top instead and the
          line gets the whole panel. */}
      <div className={`workspace ${app === 'roadmap' || narrow ? 'is-stacked' : ''}`}>
        <AppRail active={app} onSelect={setApp} />
        {app === 'roadmap' ? (
          <div className="workspace-main">
            <Sidebar />
            <main className="stage">
              <Timeline />
            </main>
          </div>
        ) : (
          <div className="workspace-main">
            <BrandDelivery />
          </div>
        )}
      </div>

      {error && <div className="toast">{error}</div>}
      {accountsOpen && <AccountsModal onClose={() => setAccountsOpen(false)} />}
    </div>
  )
}
