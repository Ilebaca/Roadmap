import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '../state/store'
import { buildLayout, dateFromDrag, EMPTY_SLOT_AT, METRICS, nowMarker } from '../lib/layout'
import { addDays, daysBetween, formatDot, formatShort, todayISO } from '../lib/dates'
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
/** How much of the panel one task takes up. */
const BLOCK_SHARE = 0.8

/** The gap the stylesheet leaves between a card and its own end dot
 *  (`.timeline-canvas.is-horizontal .block-slot { padding-right }`). Added
 *  back on so the share above is the width of the card you actually see. */
const SLOT_PAD = 16

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

  const metrics = useMemo(() => {
    const base = narrow ? METRICS.horizontalNarrow : METRICS.horizontal
    // Before the first measurement there is nothing to take a share of, so the
    // fixed width stands in for one frame.
    if (!panelW) return base
    return { ...base, MIN_BLOCK: Math.round(panelW * BLOCK_SHARE) + SLOT_PAD }
  }, [narrow, panelW])

  const layout = useMemo(
    () => buildLayout({ phases, blocks, gates, heights, drag, canCreate: admin, metrics }),
    [phases, blocks, gates, heights, drag, admin, metrics]
  )

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

  // Selecting a tab scrolls that phase's stretch of the line into view.
  useEffect(() => {
    const el = scrollRef.current
    const off = layout.phaseOffsets[activePhaseId]
    if (!el || !off) return
    const to = Math.max(0, off.start - 16)
    el.scrollTo({ [horizontal ? 'left' : 'top']: to, behavior: 'smooth' })
    // Only when the active phase changes — not on every relayout.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePhaseId])

  // --- drag-to-resize: an edge drag moves the block's date -------------------
  const onResizeStart = useCallback(
    (e, edge, block, minStart) => {
      e.preventDefault()
      // Dots to snap onto — every other date already on the line.
      const snapDates = layout.dots.filter((d) => d.blockId !== block.id).map((d) => d.date)
      dragRef.current = {
        blockId: block.id,
        edge,
        origin: horizontal ? e.clientX : e.clientY,
        start_date: block.start_date,
        end_date: block.end_date,
        minStart,
        snapDates
      }
      setDrag({ blockId: block.id, start_date: block.start_date, end_date: block.end_date })

      const move = (ev) => {
        const d = dragRef.current
        if (!d) return
        const delta = (horizontal ? ev.clientX : ev.clientY) - d.origin
        let start_date = d.start_date
        let end_date = d.end_date
        if (d.edge === 'bottom') {
          end_date = dateFromDrag(d.end_date, delta, d.snapDates)
          if (daysBetween(start_date, end_date) < 1) end_date = addDays(start_date, 1)
        } else {
          start_date = dateFromDrag(d.start_date, delta, d.snapDates)
          // A block can never start before the block in front of it finishes.
          if (d.minStart && daysBetween(d.minStart, start_date) < 0) start_date = d.minStart
          if (daysBetween(start_date, end_date) < 1) start_date = addDays(end_date, -1)
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
    [layout.dots, actions, horizontal]
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
        style={horizontal ? { width: layout.total } : { height: layout.total }}
      >
        <div className="timeline-rule" />

        {/* An empty roadmap still carries the line and today's date, with the
            first block started from here. */}
        {!phases.length && (
          <>
            <div className="dot-row kind-slot" style={place(EMPTY_SLOT_AT)}>
              <div className="date-label">
                <span className="date-day">
                  {formatDot(today).day} {formatDot(today).month}
                </span>
                <span className="date-year">{formatDot(today).year}</span>
              </div>
              <span className="dot" />
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

        {/* dots + their date labels (label left of the dot) */}
        {layout.dots.map((dot) => {
          const { day, month, year } = formatDot(dot.date)
          return (
            <div key={dot.key} className={`dot-row kind-${dot.kind}`} style={place(dot.at)}>
              <div className="date-label">
                <span className="date-day">
                  {day} {month}
                </span>
                <span className="date-year">{year}</span>
              </div>
              <span className={`dot ${dot.state ? `dot-${dot.state}` : ''} ${drag?.blockId === dot.blockId ? 'dot-live' : ''}`} />
            </div>
          )
        })}

        {layout.rows.map((row) => {
          if (row.type === 'phase') {
            return (
              <div key={row.key} className={`phase-marker ${row.phase.id === activePhaseId ? 'is-active' : ''}`} style={place(row.at, row.len)}>
                <span className="phase-marker-chip">
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
          const now = nowMarker(layout.dots, layout.total, today)
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
