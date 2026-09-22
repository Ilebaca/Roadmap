import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '../state/store'
import { buildLayout, dateFromDrag, nowMarker } from '../lib/layout'
import { addDays, daysBetween, formatDot, formatShort, todayISO } from '../lib/dates'
import { canApprove, canCreate, canEditBlock, canSetState, canUnapprove } from '../lib/permissions'
import BlockCard from './BlockCard'
import { Lock, Plus } from './Icons'

/**
 * The date line. One continuous vertical rule splits this section down the
 * middle; dates sit on it as dots, labels to the left, blocks to the right.
 */
export default function Timeline() {
  const store = useStore()
  const { session, phases, blocks, gates, activePhaseId, actions } = store
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

  const layout = useMemo(
    () => buildLayout({ phases, blocks, gates, heights, drag, canCreate: admin }),
    [phases, blocks, gates, heights, drag, admin]
  )

  // Selecting a tab scrolls that phase's stretch of the line into view.
  useEffect(() => {
    const el = scrollRef.current
    const off = layout.phaseOffsets[activePhaseId]
    if (!el || !off) return
    el.scrollTo({ top: Math.max(0, off.top - 16), behavior: 'smooth' })
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
        originY: e.clientY,
        start_date: block.start_date,
        end_date: block.end_date,
        minStart,
        snapDates
      }
      setDrag({ blockId: block.id, start_date: block.start_date, end_date: block.end_date })

      const move = (ev) => {
        const d = dragRef.current
        if (!d) return
        const delta = ev.clientY - d.originY
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
    [layout.dots, actions]
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
    <div className="timeline-scroll" ref={scrollRef}>
      <div className="timeline-canvas" style={{ height: layout.totalHeight }}>
        <div className="timeline-rule" />

        {/* dots + their date labels (label left of the dot) */}
        {layout.dots.map((dot) => {
          const { day, month, year } = formatDot(dot.date)
          return (
            <div key={dot.key} className={`dot-row kind-${dot.kind}`} style={{ top: dot.y }}>
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
              <div key={row.key} className={`phase-marker ${row.phase.id === activePhaseId ? 'is-active' : ''}`} style={{ top: row.y, height: row.h }}>
                <span className="phase-marker-chip">
                  {!row.gate.unlocked && <Lock width="12" height="12" />}
                  {row.phase.title}
                </span>
              </div>
            )
          }

          if (row.type === 'locked') {
            return (
              <div key={row.key} className="locked-banner" style={{ top: row.y, height: row.h }}>
                <Lock width="18" height="18" />
                <strong>{row.phase.title} is locked</strong>
                <span>Every block in the previous phase has to be approved first.</span>
              </div>
            )
          }

          if (row.type === 'slot') {
            return (
              <div key={row.key} className="slot" style={{ top: row.y, height: row.h }}>
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
          return (
            <div key={row.key} className="block-row">
              {/* The rail on the line ties the block's start dot to its end dot. */}
              <div className="block-extent" style={{ top: row.y, height: row.h }} />
              {editable && (
                <div
                  className="extent-handle"
                  style={{ top: row.y + row.h }}
                  onPointerDown={(e) => onResizeStart(e, 'bottom', block, row.minStart)}
                  title="Drag to move the deadline"
                />
              )}
              <div className="block-slot" style={{ top: row.y, height: row.h }}>
              <BlockCard
                block={block}
                height={row.h}
                minStart={row.minStart}
                canEdit={editable}
                canSetState={canSetState(session, block)}
                canApprove={canApprove(session, block)}
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
          const now = nowMarker(layout.dots, layout.totalHeight, today)
          if (!now) return null
          return (
            <>
            <span className={`now-dot ${now.clamped ? 'is-clamped' : ''}`} style={{ top: now.y }} />
            <div className={`now-marker ${now.clamped ? 'is-clamped' : ''}`} style={{ top: now.y }}>
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
