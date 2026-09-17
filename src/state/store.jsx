import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { api } from '../services/dataClient'
import { computePhaseGates } from '../lib/permissions'

/**
 * The app's only state container. It talks to the data layer (`api`) and nothing
 * else — no component reaches past it. Each action calls `api`, then refetches
 * the project's rows, which is exactly the shape a Supabase-backed version takes
 * (call, then refetch or subscribe to realtime).
 */

const StoreContext = createContext(null)

export function StoreProvider({ children }) {
  const [session, setSession] = useState(null) // the signed-in user row
  const [accounts, setAccounts] = useState([]) // dev role switcher only
  const [project, setProject] = useState(null)
  const [phases, setPhases] = useState([])
  const [blocks, setBlocks] = useState([])
  const [approvals, setApprovals] = useState([])
  const [activePhaseId, setActivePhaseId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // --- boot: pick a session --------------------------------------------------
  useEffect(() => {
    let alive = true
    ;(async () => {
      // BACKEND: replace with supabase.auth.getUser() + a redirect to sign-in.
      const users = await api.listUsers()
      const me = await api.getSession(users[0].id)
      if (!alive) return
      setAccounts(users)
      setSession(me)
    })()
    return () => {
      alive = false
    }
  }, [])

  // --- load everything scoped to the session's project -----------------------
  const refresh = useCallback(async (who = session) => {
    if (!who) return
    setError(null)
    // A viewer is bound to exactly one project; an admin here works on that same
    // project. `project_id` on the user row is what RLS filters on later.
    const [proj, ph, bl, ap] = await Promise.all([
      api.getProject(who, who.project_id),
      api.listPhases(who, who.project_id),
      api.listBlocks(who, who.project_id),
      api.listApprovals(who, who.project_id)
    ])
    setProject(proj)
    setPhases(ph)
    setBlocks(bl)
    setApprovals(ap)
    setLoading(false)
    return ph
  }, [session])

  useEffect(() => {
    if (!session) return
    setLoading(true)
    refresh(session)
  }, [session, refresh])

  const gates = useMemo(() => computePhaseGates(phases, blocks), [phases, blocks])

  // Keep the active tab valid: default to the last unlocked phase, and bounce
  // off any tab that has become locked again.
  useEffect(() => {
    if (!phases.length) return
    const unlocked = phases.filter((p) => gates[p.id]?.unlocked)
    const stillOk = activePhaseId && gates[activePhaseId]?.unlocked
    if (!stillOk) setActivePhaseId((unlocked.at(-1) ?? phases[0]).id)
  }, [phases, gates, activePhaseId])

  // --- actions ---------------------------------------------------------------
  const run = useCallback(
    async (fn) => {
      try {
        const out = await fn()
        await refresh()
        return out
      } catch (e) {
        setError(e.message || String(e))
        setTimeout(() => setError(null), 4000)
        return null
      }
    },
    [refresh]
  )

  const actions = useMemo(
    () => ({
      /** DEV ONLY — the role switcher. Real auth replaces this with sign-in. */
      async switchUser(userId) {
        const me = await api.getSession(userId)
        setSession(me)
      },
      selectPhase(phaseId) {
        setActivePhaseId(phaseId)
      },
      createBlock(input) {
        return run(() => api.createBlock(session, input))
      },
      updateBlock(id, patch) {
        return run(() => api.updateBlock(session, id, patch))
      },
      deleteBlock(id) {
        return run(() => api.deleteBlock(session, id))
      },
      setBlockState(id, state) {
        return run(() => api.updateBlock(session, id, { state }))
      },
      approveBlock(id) {
        return run(() => api.approveBlock(session, id))
      },
      createPhase(title) {
        return run(() => api.createPhase(session, { project_id: session.project_id, title }))
      },
      createAccount(input) {
        return run(async () => {
          const u = await api.createUser(session, input)
          setAccounts(await api.listUsers())
          return u
        })
      },
      async resetMockData() {
        await api.resetMockData()
        const users = await api.listUsers()
        setAccounts(users)
        const me = await api.getSession(session?.id ?? users[0].id)
        setSession(me)
        await refresh(me)
      }
    }),
    [run, session, refresh]
  )

  const value = {
    session,
    accounts,
    project,
    phases,
    blocks,
    approvals,
    gates,
    activePhaseId,
    loading,
    error,
    actions,
    approvalFor: (blockId) => approvals.find((a) => a.block_id === blockId) || null,
    userById: (id) => accounts.find((u) => u.id === id) || null
  }

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}

export function useStore() {
  const ctx = useContext(StoreContext)
  if (!ctx) throw new Error('useStore must be used inside <StoreProvider>')
  return ctx
}
