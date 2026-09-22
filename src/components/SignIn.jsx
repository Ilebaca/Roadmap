import { useState } from 'react'
import { api } from '../services/dataClient'

/** The sign-in screen. Only ever shown when a real backend is configured. */
export default function SignIn() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await api.signIn({ email: email.trim(), password })
      // the session listener in the store takes it from here
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  return (
    <div className="signin-frame">
      <form className="signin" onSubmit={submit}>
        <span className="brand-dot" />
        <h1>Roadmap</h1>
        <p>Sign in to see your project.</p>

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
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>

        <button className="primary-btn" type="submit" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>

        {error && <p className="signin-error">{error}</p>}
      </form>
    </div>
  )
}
