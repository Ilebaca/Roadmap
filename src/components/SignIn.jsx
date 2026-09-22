import { useState } from 'react'
import { api } from '../services/dataClient'

/**
 * The sign-in screen. Only ever shown when a real backend is configured.
 *
 * It doubles as the way a client claims the access an admin gave them: there is
 * no invite email to click, because sending one needs the service_role key.
 * They set their own password here with the address that was invited, and a
 * trigger in the database binds the new login to that client.
 */
export default function SignIn() {
  const [mode, setMode] = useState('in') // 'in' | 'up'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [check, setCheck] = useState(false)

  const signingUp = mode === 'up'

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      if (signingUp) {
        const { needsConfirmation } = await api.signUp({ email: email.trim(), password })
        if (needsConfirmation) {
          setCheck(true)
          setBusy(false)
          return
        }
      } else {
        await api.signIn({ email: email.trim(), password })
      }
      // the session listener in the store takes it from here
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  if (check) {
    return (
      <div className="signin-frame">
        <div className="signin">
          <span className="brand-dot" />
          <h1>Check your email</h1>
          <p>
            We sent a confirmation link to <strong>{email.trim()}</strong>. Open it, then come back and sign in.
          </p>
          <button className="ghost-btn" onClick={() => { setCheck(false); setMode('in') }}>
            Back to sign in
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="signin-frame">
      <form className="signin" onSubmit={submit}>
        <span className="brand-dot" />
        <h1>{signingUp ? 'Set your password' : 'Roadmap'}</h1>
        <p>
          {signingUp
            ? 'Use the email address the studio gave access to. Anything else gets you an account that can see nothing.'
            : 'Sign in to see your project.'}
        </p>

        <label>
          <span>Email</span>
          <input
            type="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoFocus
          />
        </label>

        <label>
          <span>Password</span>
          <input
            type="password"
            autoComplete={signingUp ? 'new-password' : 'current-password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={signingUp ? 8 : undefined}
            required
          />
        </label>

        <button className="primary-btn" type="submit" disabled={busy}>
          {busy ? 'One moment…' : signingUp ? 'Create my password' : 'Sign in'}
        </button>

        {error && <p className="signin-error">{error}</p>}

        <button
          type="button"
          className="signin-switch"
          onClick={() => {
            setMode(signingUp ? 'in' : 'up')
            setError(null)
          }}
        >
          {signingUp ? 'I already have a password' : 'First time here? Set your password'}
        </button>
      </form>
    </div>
  )
}
