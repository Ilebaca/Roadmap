import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { api, isLive } from '../services/dataClient'
import { computePhaseGates, isAdmin } from '../lib/permissions'
import { addDays, todayISO } from '../lib/dates'

/**
 * The app's only state container. It talks to the data layer (`api`) and nothing
 * else — no component reaches past it. Each action calls `api`, then refetches
 * the project's rows, which is exactly the shape a Supabase-backed version takes
 * (call, then refetch or subscribe to realtime).
 */

const StoreContext = createContext(null)

export function StoreProvider({ children }) {
  const [session, setSession] = useState(null) // the signed-in user row
  const [accounts, setAccounts] = useState([]) // everyone with access
  const [invites, setInvites] = useState([]) // people asked in who have not signed up yet
  const [project, setProject] = useState(null)
  const [projects, setProjects] = useState([]) // every client this account can open
  const [activeProjectId, setActiveProjectId] = useState(null)
  const [phases, setPhases] = useState([])
  const [blocks, setBlocks] = useState([])
  const [approvals, setApprovals] = useState([])
  const [links, setLinks] = useState([])
  const [brandSections, setBrandSections] = useState([])
  const [brandAssets, setBrandAssets] = useState([])
  const [activePhaseId, setActivePhaseId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  // Live: whether we have asked the backend who is signed in yet. Without it
  // the sign-in screen flashes up before the answer comes back.
  const [authReady, setAuthReady] = useState(!isLive)

  // --- boot: who is signed in? ----------------------------------------------
  useEffect(() => {
    let alive = true
    let unsubscribe = () => {}

    const readSession = async () => {
      try {
        const me = await api.getSession()
        if (!alive) return
        // Supabase re-checks the session whenever the tab regains focus. When
        // it is the same person, keep the object we already have: replacing it
        // would reload the whole project and flash the loading screen every
        // time you come back to the tab.
        setSession((prev) => (prev && me && prev.id === me.id ? prev : me))
        if (!me) setLoading(false)
      } catch (e) {
        if (!alive) return
        setError(e.message)
        setSession(null)
        setLoading(false)
      } finally {
        if (alive) setAuthReady(true)
      }
    }

    ;(async () => {
      if (isLive) {
        await readSession()
        unsubscribe = api.onAuthChange(readSession)
        return
      }
      // The mock has no sign-in: the dev toggle picks who you are.
      const users = await api.listUsers()
      const me = await api.getSession(users[0].id)
      if (!alive) return
      setAccounts(users)
      setSession(me)
    })()

    return () => {
      alive = false
      unsubscribe()
    }
  }, [])

  // --- which clients this account can open -----------------------------------
  useEffect(() => {
    if (!session || session.pending) return
    let alive = true
    ;(async () => {
      // BACKEND: supabase.from('projects').select('*') — RLS returns the one
      // project a viewer is bound to, or every client an admin runs.
      const rows = await api.listProjects(session)
      if (!alive) return
      setProjects(rows)
      if (isAdmin(session)) {
        api.listUsers().then((u) => alive && setAccounts(u)).catch(() => {})
        api.listInvites().then((i) => alive && setInvites(i)).catch(() => {})
      }
      // A viewer always lands on their own project; an admin starts on theirs.
      setActiveProjectId(rows.some((p) => p.id === session.project_id) ? session.project_id : rows[0]?.id ?? null)
    })()
    return () => {
      alive = false
    }
  }, [session])

  // --- load everything scoped to the active project --------------------------
  const refresh = useCallback(async (who = session, projectId = activeProjectId) => {
    if (!who || !projectId) return
    setError(null)
    // Every read is scoped to the project on screen. For a viewer that is the
    // one project their user row is bound to; RLS enforces it for real later.
    try {
      const [proj, ph, bl, ap, lk, bs, ba] = await Promise.all([
        api.getProject(who, projectId),
        api.listPhases(who, projectId),
        api.listBlocks(who, projectId),
        api.listApprovals(who, projectId),
        api.listLinks(who, projectId),
        api.listBrandSections(who, projectId),
        api.listBrandAssets(who, projectId)
      ])
      setProject(proj)
      setPhases(ph)
      setBlocks(bl)
      setApprovals(ap)
      setLinks(lk)
      setBrandSections(bs)
      setBrandAssets(ba)
      setLoading(false)
      return ph
    } catch (e) {
      setLoading(false)
      setError(e.message || String(e))
      setTimeout(() => setError(null), 4000)
      return null
    }
  }, [session, activeProjectId])

  useEffect(() => {
    if (session?.pending) setLoading(false)
    if (!session || session.pending || !activeProjectId) return
    // A viewer is bound to one project. On a session change the active project
    // can briefly still be the previous user's — skip that render; the effect
    // above corrects it.
    if (session.role !== 'admin' && session.project_id !== activeProjectId) return
    setLoading(true)
    refresh(session, activeProjectId)
  }, [session, activeProjectId, refresh])

  // Admins plan the whole project, so no phase is ever closed to them; the gate
  // is what releases work to the client.
  const gates = useMemo(
    () => computePhaseGates(phases, blocks, { unlockAll: isAdmin(session) }),
    [phases, blocks, session]
  )

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

  const actionsRef = useMemo(
    () => ({
      /** DEV ONLY — the role switcher. Real auth replaces this with sign-in. */
      async signOut() {
        await api.signOut()
        setSession(null)
        setProjects([])
        setActiveProjectId(null)
      },
      async switchUser(userId) {
        const me = await api.getSession(userId)
        // Move the active client with the user so no render sees the previous
        // user's project under the new session.
        setActiveProjectId(me.project_id)
        setActivePhaseId(null)
        setSession(me)
      },
      selectPhase(phaseId) {
        setActivePhaseId(phaseId)
      },
      /** Admin only: start a new client and open it. */
      async createProject(name) {
        try {
          const row = await api.createProject(session, { name })
          setProjects(await api.listProjects(session))
          setActivePhaseId(null)
          setActiveProjectId(row.id)
          return row
        } catch (e) {
          setError(e.message || String(e))
          setTimeout(() => setError(null), 4000)
          return null
        }
      },
      /** Admin only: rename the client from the top bar. */
      async renameProject(id, name) {
        try {
          await api.updateProject(session, id, { name })
          setProjects(await api.listProjects(session))
          await refresh()
        } catch (e) {
          setError(e.message || String(e))
          setTimeout(() => setError(null), 4000)
        }
      },
      /** Admin only in practice — a viewer's list holds just their own client. */
      selectProject(projectId) {
        if (projectId === activeProjectId) return
        setActivePhaseId(null)
        setActiveProjectId(projectId)
      },
      createBlock(input) {
        return run(() => api.createBlock(session, input))
      },
      /**
       * The first block of an empty roadmap. There is no phase to hang it on
       * yet, so one is created first.
       */
      createFirstBlock() {
        return run(async () => {
          const phase =
            phases[0] ?? (await api.createPhase(session, { project_id: activeProjectId, title: 'Phase 1' }))
          const start = todayISO()
          return api.createBlock(session, {
            phase_id: phase.id,
            title: 'Untitled block',
            description: '',
            start_date: start,
            end_date: addDays(start, 7)
          })
        })
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
      /** Admin-only: undo an approval so the block is editable again. */
      unapproveBlock(id) {
        return run(() => api.unapproveBlock(session, id))
      },
      addLink(block_id, label, url) {
        return run(() => api.createLink(session, { block_id, label, url }))
      },
      removeLink(id) {
        return run(() => api.deleteLink(session, id))
      },
      /** Admin only: removes the phase and everything inside it. */
      removePhase(id) {
        return run(() => api.deletePhase(session, id))
      },
      createPhase(title) {
        return run(() => api.createPhase(session, { project_id: activeProjectId, title }))
      },
      addBrandSection(input) {
        return run(() => api.createBrandSection(session, { project_id: activeProjectId, ...input }))
      },
      reorderBrandSections(orderedIds) {
        return run(() => api.reorderBrandSections(session, activeProjectId, orderedIds))
      },
      updateBrandSection(id, patch) {
        return run(() => api.updateBrandSection(session, id, patch))
      },
      removeBrandSection(id) {
        return run(() => api.deleteBrandSection(session, id))
      },
      addBrandAsset(input) {
        return run(() => api.createBrandAsset(session, input))
      },
      /**
       * A grid arrives with its cells already in place — two or three empty
       * ones, nothing else. How many cells it has is what makes it a grid of
       * two or of three.
       */
      addGrid(section_id, count) {
        return run(async () => {
          const grid = await api.createBrandAsset(session, {
            section_id,
            kind: 'grid',
            columns: count,
            title: null
          })
          for (let i = 0; i < count; i++) {
            await api.createBrandAsset(session, { section_id, kind: 'image', parent_id: grid.id })
          }
          return grid
        })
      },
      updateBrandAsset(id, patch) {
        return run(() => api.updateBrandAsset(session, id, patch))
      },
      removeBrandAsset(id) {
        return run(() => api.deleteBrandAsset(session, id))
      },
      reorderBrandAssets(sectionId, orderedIds) {
        return run(() => api.reorderBrandAssets(session, sectionId, orderedIds))
      },
      moveBrandAsset(id, direction) {
        return run(() => api.moveBrandAsset(session, id, direction))
      },
      /** Ask somebody in. They claim it by signing up with that address. */
      async inviteUser(input) {
        const row = await api.createInvite(session, input)
        await actionsRef.reloadAccounts()
        return row
      },
      async cancelInvite(id) {
        await api.deleteInvite(session, id)
        await actionsRef.reloadAccounts()
      },
      async revokeAccess(userId) {
        await api.revokeAccess(session, userId)
        await actionsRef.reloadAccounts()
      },
      async reloadAccounts() {
        const [u, i] = await Promise.all([api.listUsers(), api.listInvites()])
        setAccounts(u)
        setInvites(i)
      },
      signOut() {
        return api.signOut()
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [run, session, refresh, activeProjectId, phases]
  )
  const actions = actionsRef

  const value = {
    session,
    accounts,
    invites,
    authReady,
    isLive,
    project,
    projects,
    activeProjectId,
    phases,
    blocks,
    approvals,
    links,
    brandSections,
    brandAssets,
    gates,
    activePhaseId,
    loading,
    error,
    actions,
    approvalFor: (blockId) => approvals.find((a) => a.block_id === blockId) || null,
    linksFor: (blockId) => links.filter((l) => l.block_id === blockId),
    /** Everything in a category, grids and their images alike. */
    assetsFor: (sectionId) =>
      brandAssets.filter((a) => a.section_id === sectionId).sort((a, b) => a.order_index - b.order_index),
    /** Just the items that sit in the category's own column. */
    topAssetsFor: (sectionId) =>
      brandAssets
        .filter((a) => a.section_id === sectionId && !a.parent_id)
        .sort((a, b) => a.order_index - b.order_index),
    userById: (id) => accounts.find((u) => u.id === id) || null
  }

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}

export function useStore() {
  const ctx = useContext(StoreContext)
  if (!ctx) throw new Error('useStore must be used inside <StoreProvider>')
  return ctx
}
