import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '../state/store'
import { buildLayout, dateFromDrag, dateLabels, EMPTY_SLOT_AT, METRICS, nowMarker } from '../lib/layout'
import { addDays, daysBetween, formatDot, formatDotGroup, formatShort, todayISO } from '../lib/dates'
import { canApprove, canCreate, canEditBlock, canSetState, canUnapprove } from '../lib/permissions'
import BlockCard from './BlockCard'
import { Lock, Plus } from './Icons'

/**
 * The date line. One continuous rule runs through this section; dates sit on
 * it as dots, with their labels on one side and the blocks on the other.
 *
 * Down the page it splits the section and blocks hang to its right. Across the
 * page it runs through the middle, labels above, blocks below. The geometry is
 * the same either way — buildLayout returns a position and a length along one
 * axis, and `place()` below is the only thing that knows which axis that is.
 */
/** How much of the panel one task takes up on a phone. On a desk the card
 *  keeps its fixed width: a share of a wide window is a card wider than
 *  anything in it, with a line of description running the whole way across. */
const BLOCK_SHARE = 0.8

export default function Timeline() {
  const store = useStore()
  const { session, phases, blocks, gates, blockGates, activePhaseId, actions } = store
  const scrollRef = useRef(null)
  const [heights, setHeights] = useState({})
  const [drag, setDrag] = useState(null)
  const dragRef = useRef(null)
  const [today, setToday] = useState(todayISO())

  // The "now" marker follows the clock: re-check every half minute so it moves
  // on its own and rolls over at midnight without a reload.
  useEffect(() => {
    const id = setInterval(() => setToday(todayISO()), 30000)
    return () => clearInterval(id)
  }, [])

  const admin = canCreate(session)

  const onMeasure = useCallback((id, h) => {
    setHeights((prev) => (prev[id] === h ? prev : { ...prev, [id]: h }))
  }, [])

  // The line only runs across the page now. The layout still works in one
  // abstract dimension, so this stays a single constant rather than being
  // spread back through the geometry.
  const horizontal = true

  // On a phone the spacing around a card is tighter than it is on a desk.
  // Measured rather than guessed from a media query, because the layout
  // arithmetic needs the number, not just the stylesheet.
  const [narrow, setNarrow] = useState(
    () => typeof window !== 'undefined' && window.innerWidth < 640
  )
  useEffect(() => {
    const onResize = () => setNarrow(window.innerWidth < 640)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  // How wide a task is: a share of the panel it is read in, not a fixed
  // number. One task at a time is the whole point of the roadmap, so it gets
  // most of the width — enough for a real description, its links and its
  // overdue note — with the rest left over so the next card shows at the edge
  // and the line is visibly going somewhere.
  const [panelW, setPanelW] = useState(0)
  useEffect(() => {
    const el = scrollRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(([entry]) => setPanelW(entry.contentRect.width))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // The phase's name sits on the line, so the layout has to know how much line
  // it takes up — and a phase can be called anything. Each chip reports its own
  // width, which also covers a font loading in late and changing it.
  const [heads, setHeads] = useState({})
  const chipRO = useRef(null)
  useEffect(() => () => chipRO.current?.disconnect(), [])

  // Built on the first chip rather than in an effect: refs are attached before
  // effects run, so an observer created in one would miss the chips already on
  // screen and the first layout would use the fallback width for good.
  const chipRef = useCallback((node) => {
    if (typeof ResizeObserver === 'undefined') return
    if (!chipRO.current) {
      chipRO.current = new ResizeObserver((entries) => {
        setHeads((prev) => {
          let next = prev
          for (const e of entries) {
            const id = e.target.dataset.phase
            // offsetWidth, not contentRect: the chip's padding and border are
            // line it covers too, and leaving them out puts its own phase's
            // first dot under its right-hand edge.
            const w = e.target.offsetWidth
            if (next[id] !== w) next = { ...next, [id]: w }
          }
          return next
        })
      })
    }
    const ro = chipRO.current
    ro.observe(node)
    return () => ro.unobserve(node)
  }, [])

  const metrics = useMemo(() => {
    if (!narrow) return METRICS.horizontal
    // Before the first measurement there is nothing to take a share of, so the
    // fixed width stands in for one frame.
    if (!panelW) return METRICS.horizontalNarrow
    return { ...METRICS.horizontalNarrow, MIN_BLOCK: Math.round(panelW * BLOCK_SHARE) }
  }, [narrow, panelW])

  const layout = useMemo(
    () => buildLayout({ phases, blocks, gates, heights, phaseHeads: heads, drag, canCreate: admin, metrics }),
    [phases, blocks, gates, heights, heads, drag, admin, metrics]
  )

  // Two dates a gap apart cannot both be written out, so the ones that would
  // collide share a label. The width to keep clear is roughly how wide such a
  // label gets — a range is longer than a single date.
  const labels = useMemo(
    () => dateLabels(layout.dots, narrow ? 88 : 104),
    [layout.dots, narrow]
  )

  // Where today falls. Hoisted out of the markup because the line itself is
  // drawn from it: the stretch already behind us is inked and the stretch
  // still to come is a hairline, so the line says how far the job has got
  // before you have read a single date off it.
  const now = useMemo(
    () => nowMarker(layout.dots, layout.total, today),
    [layout.dots, layout.total, today]
  )

  /** Today, broken up for the label an empty roadmap carries. */
  const emptyDate = useMemo(() => formatDot(today), [today])

  /** A position and a length on the line -> the CSS for whichever way it runs. */
  const place = useCallback(
    (at, len) =>
      horizontal
        ? { left: at, ...(len == null ? null : { width: len }) }
        : { top: at, ...(len == null ? null : { height: len }) },
    [horizontal]
  )

  // A mouse wheel only reports vertical movement, and the line runs sideways,
  // so a plain scroll would do nothing at all. Turning deltaY into scrollLeft
  // is what makes the timeline feel like a page.
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return

    const onWheel = (e) => {
      // A trackpad already sends deltaX for a sideways swipe; leave that be.
      if (!e.deltaY || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return

      // A tall block scrolls inside itself. If the pointer is over one that
      // still has somewhere to go in this direction, the wheel is its.
      const inner = e.composedPath().find((n) => {
        if (!(n instanceof HTMLElement) || n === el) return false
        const style = getComputedStyle(n)
        if (!/auto|scroll/.test(style.overflowY)) return false
        if (n.scrollHeight <= n.clientHeight) return false
        const room = e.deltaY > 0
          ? n.scrollTop < n.scrollHeight - n.clientHeight - 1
          : n.scrollTop > 0
        return room
      })
      if (inner) return

      el.scrollLeft += e.deltaY
      e.preventDefault()
    }

    // preventDefault needs a non-passive listener.
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  /**
   * Where to be looking when a roadmap opens.
   *
   * Not the beginning of it. A project that has been running a while starts
   * with months of signed-off work, and landing there means scrolling past all
   * of it every single time to reach the one task anybody can actually act on.
   * So: the live task, with a little of the line before it so it does not read
   * as the start of everything.
   *
   * The wait matters. Two measurements decide where anything sits — how wide
   * the panel is, and how much line each phase name takes up — and both arrive
   * a frame or two after the first paint. Placing before they land puts the
   * view in the wrong place and leaves it there. The timer is for a browser
   * with no ResizeObserver, where the second measurement never arrives at all.
   */
  const placedFor = useRef(null)
  const [settled, setSettled] = useState(false)
  useEffect(() => {
    if (settled) return
    if (panelW > 0 && phases.every((p) => heads[p.id] != null)) return setSettled(true)
    const id = setTimeout(() => setSettled(true), 500)
    return () => clearTimeout(id)
  }, [settled, panelW, phases, heads])

  const projectId = store.project?.id ?? null
  useEffect(() => {
    const el = scrollRef.current
    if (!el || !settled || !layout.rows.length) return
    if (placedFor.current === projectId) return
    placedFor.current = projectId

    const blocks = layout.rows.filter((r) => r.type === 'block')
    // The one in hand; failing that where today falls, which is the same
    // answer on a roadmap that is finished or has not started.
    const live = blocks.find((r) => blockGates[r.block.id] === 'active')
    const at = live ? live.at : (now?.at ?? blocks[0]?.at)
    if (at == null) return

    // Centred in the panel. The task in hand is the subject of the screen, so
    // it sits in the middle of it rather than tucked against one edge — with
    // the line running away from it in both directions, which is what a
    // roadmap looks like from where the work actually is.
    const cardW = metrics.MIN_BLOCK
    const to = horizontal ? at + cardW / 2 - el.clientWidth / 2 : at - 28
    el.scrollTo({ [horizontal ? 'left' : 'top']: Math.max(0, to), behavior: 'auto' })
  }, [settled, projectId, layout, blockGates, now, horizontal, metrics])

  // Selecting a tab scrolls that phase's stretch of the line into view — but
  // never on the way in, where it would drag the view back to the top of the
  // phase and undo the placement above.
  const lastPhase = useRef(null)
  useEffect(() => {
    const el = scrollRef.current
    const off = layout.phaseOffsets[activePhaseId]
    const first = lastPhase.current === null
    lastPhase.current = activePhaseId
    if (!el || !off || first) return
    const to = Math.max(0, off.start - 16)
    el.scrollTo({ [horizontal ? 'left' : 'top']: to, behavior: 'smooth' })
    // Only when the active phase changes — not on every relayout.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePhaseId])

  // --- drag-to-resize: an edge drag moves the block's date -------------------
  const onResizeStart = useCallback(
    (e, edge, block, minStart) => {
      e.preventDefault()
      dragRef.current = {
        blockId: block.id,
        edge,
        origin: horizontal ? e.clientX : e.clientY,
        start_date: block.start_date,
        end_date: block.end_date,
        minStart
      }
      setDrag({ blockId: block.id, start_date: block.start_date, end_date: block.end_date })

      const move = (ev) => {
        const d = dragRef.current
        if (!d) return
        const delta = (horizontal ? ev.clientX : ev.clientY) - d.origin
        let start_date = d.start_date
        let end_date = d.end_date
        // An edge dragged onto the other one is a block that starts and ends
        // on the same day, which is a normal shape for a job — what neither
        // edge may do is cross the other.
        if (d.edge === 'bottom') {
          end_date = dateFromDrag(d.end_date, delta)
          if (daysBetween(start_date, end_date) < 0) end_date = start_date
        } else {
          start_date = dateFromDrag(d.start_date, delta)
          // A block can never start before the block in front of it finishes —
          // on that day is allowed; the day one ends is the day the next can
          // begin.
          if (d.minStart && daysBetween(d.minStart, start_date) < 0) start_date = d.minStart
          if (daysBetween(start_date, end_date) < 0) start_date = end_date
        }
        setDrag({ blockId: d.blockId, start_date, end_date })
      }

      const up = () => {
        window.removeEventListener('pointermove', move)
        window.removeEventListener('pointerup', up)
        const d = dragRef.current
        dragRef.current = null
        setDrag((current) => {
          if (d && current && (current.start_date !== d.start_date || current.end_date !== d.end_date)) {
            // BACKEND: this is the write that persists the new dates.
            actions.updateBlock(d.blockId, {
              start_date: current.start_date,
              end_date: current.end_date
            })
          }
          return null
        })
      }

      window.addEventListener('pointermove', move)
      window.addEventListener('pointerup', up)
    },
    [actions, horizontal]
  )

  const handleCreate = (row) => {
    actions.createBlock({
      phase_id: row.phase.id,
      title: 'Untitled block',
      description: '',
      start_date: row.start_date,
      end_date: row.end_date
    })
  }

  return (
    <div className={`timeline-scroll ${horizontal ? 'is-horizontal' : ''}`} ref={scrollRef}>
      <div
        className={`timeline-canvas ${horizontal ? 'is-horizontal' : ''}`}
        style={{
          ...(horizontal ? { width: layout.total } : { height: layout.total }),
          '--now-x': `${Math.round(now?.at ?? 0)}px`
        }}
      >
        <div className="timeline-rule" />

        {/* An empty roadmap still carries the line and today's date, with the
            first block started from here. */}
        {!phases.length && (
          <>
            <div className="dot-row kind-slot" style={place(EMPTY_SLOT_AT)}>
              <span className="dot" />
            </div>
            {/* Placed the same way every other label on the line is, rather
                than nested inside the dot: inside, it has no position of its
                own and lands on top of the button underneath it. */}
            <div className="date-label is-slot" style={place(EMPTY_SLOT_AT)}>
              <span className="date-day">
                {emptyDate.day} {emptyDate.month}
              </span>
              <span className="date-year">{emptyDate.year}</span>
            </div>
            {admin ? (
              <div className="slot" style={place(EMPTY_SLOT_AT)}>
                <button className="slot-btn" onClick={actions.createFirstBlock} title="Add the first block">
                  <Plus width="20" height="20" />
                </button>
                <span className="slot-hint">New block</span>
              </div>
            ) : (
              <div className="slot" style={place(EMPTY_SLOT_AT)}>
                <span className="slot-hint empty">Nothing scheduled yet.</span>
              </div>
            )}
          </>
        )}

        {/* The dots sit on the line; their labels are placed apart from them,
            because a label can stand for more than one dot. */}
        {layout.dots.map((dot) => (
          <div key={dot.key} className={`dot-row kind-${dot.kind}`} style={place(dot.at)}>
            <span className={`dot ${dot.state ? `dot-${dot.state}` : ''} ${drag?.blockId === dot.blockId ? 'dot-live' : ''}`} />
          </div>
        ))}

        {labels.map((label) => {
          const { day, year } = formatDotGroup(label.dates)
          return (
            <div
              key={label.key}
              className={`date-label ${label.slot ? 'is-slot' : ''}`}
              style={place(label.at)}
            >
              <span className="date-day">{day}</span>
              <span className="date-year">{year}</span>
            </div>
          )
        })}

        {layout.rows.map((row) => {
          if (row.type === 'phase') {
            return (
              <div key={row.key} className={`phase-marker ${row.phase.id === activePhaseId ? 'is-active' : ''}`} style={place(row.at, row.len)}>
                <span className="phase-marker-chip" ref={chipRef} data-phase={row.phase.id}>
                  {!row.gate.unlocked && <Lock width="12" height="12" />}
                  {row.phase.title}
                  {/* Open to the admin, but not released to the client yet. */}
                  {row.gate.unlocked && row.gate.gated && <em className="chip-hint">not released</em>}
                </span>
              </div>
            )
          }

          if (row.type === 'locked') {
            return (
              <div key={row.key} className="locked-banner" style={place(row.at, row.len)}>
                <Lock width="18" height="18" />
                <strong>{row.phase.title} is locked</strong>
                <span>Every block in the previous phase has to be approved first.</span>
              </div>
            )
          }

          if (row.type === 'slot') {
            return (
              <div key={row.key} className="slot" style={place(row.at, row.len)}>
                {/* Empty date slot — admin only. Clicking creates a block here. */}
                <button className="slot-btn" onClick={() => handleCreate(row)} title="Add a block">
                  <Plus width="20" height="20" />
                </button>
                <span className="slot-hint">New block</span>
              </div>
            )
          }

          const block = row.block
          const editable = canEditBlock(session, block)
          // Where this block sits in the queue: past, active, or still to come.
          const standing = blockGates[block.id] ?? 'active'
          return (
            <div key={row.key} className={`block-row is-${standing}`}>
              {/* The rail on the line ties the block's start dot to its end dot. */}
              <div className="block-extent" style={place(row.at, row.len)} />
              {editable && (
                <div
                  className="extent-handle"
                  style={place(row.at + row.len)}
                  onPointerDown={(e) => onResizeStart(e, 'bottom', block, row.minStart)}
                  title="Drag to move the deadline"
                />
              )}
              <div className="block-slot" style={place(row.at, row.len)}>
              <BlockCard
                block={block}
                extent={row.len}
                horizontal={horizontal}
                minStart={row.minStart}
                canEdit={editable}
                standing={standing}
                canSetState={canSetState(session, block, standing)}
                canApprove={canApprove(session, block, standing)}
                canUnapprove={canUnapprove(session, block)}
                approval={store.approvalFor(block.id)}
                approverEmail={store.userById(store.approvalFor(block.id)?.approved_by)?.email}
                links={store.linksFor(block.id)}
                dragging={drag?.blockId === block.id}
                onMeasure={onMeasure}
                onPatch={actions.updateBlock}
                onState={actions.setBlockState}
                onApprove={actions.approveBlock}
                onUnapprove={actions.unapproveBlock}
                onDelete={actions.deleteBlock}
                onAddLink={actions.addLink}
                onRemoveLink={actions.removeLink}
                onResizeStart={(e, edge) => onResizeStart(e, edge, block, row.minStart)}
              />
              </div>
            </div>
          )
        })}

        {/* Where today falls on the line, live. */}
        {(() => {
          if (!now) return null
          return (
            <>
            <span className={`now-dot ${now.clamped ? 'is-clamped' : ''}`} style={place(now.at)} />
            <div className={`now-marker ${now.clamped ? 'is-clamped' : ''}`} style={place(now.at)}>
              {/* rule first, label second: the label paints over it */}
              <span className="now-rule" />
              <span className="now-label">
                Today
                <em>{formatShort(now.date)}</em>
              </span>
            </div>
            </>
          )
        })()}

        {drag && (
          <div className="drag-readout">
            {drag.start_date} → {drag.end_date} · {daysBetween(drag.start_date, drag.end_date)} days
          </div>
        )}
      </div>
    </div>
  )
}
