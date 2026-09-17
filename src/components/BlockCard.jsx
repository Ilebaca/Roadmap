import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { SELECTABLE_STATES, stateLabel } from '../lib/permissions'
import { formatLong, formatStamp } from '../lib/dates'
import { Check, Lock, Trash } from './Icons'

/**
 * A single content block sitting on the right of the date line.
 * Its top-left corner hangs off the start dot; its bottom edge reaches the end
 * dot. Height is handed down by the layout; the natural height of the content is
 * measured and reported back up so the layout can push the two dots apart.
 */
export default function BlockCard({
  block,
  height,
  canEdit,
  canSetState,
  canApprove,
  approval,
  approverEmail,
  dragging,
  onMeasure,
  onPatch,
  onState,
  onApprove,
  onDelete,
  onResizeStart
}) {
  const innerRef = useRef(null)
  const [title, setTitle] = useState(block.title)
  const [description, setDescription] = useState(block.description)

  // Keep local edit buffers in sync when the row changes underneath us.
  useEffect(() => setTitle(block.title), [block.title])
  useEffect(() => setDescription(block.description), [block.description])

  // Report the content's natural height so the layout can size this block.
  useLayoutEffect(() => {
    const el = innerRef.current
    if (!el) return
    const report = () => onMeasure(block.id, el.offsetHeight)
    report()
    const ro = new ResizeObserver(report)
    ro.observe(el)
    return () => ro.disconnect()
  }, [block.id, onMeasure])

  const locked = block.locked

  return (
    <article
      className={`block state-${block.state} ${locked ? 'is-locked' : ''} ${dragging ? 'is-dragging' : ''}`}
      style={{ height }}
    >
      {canEdit && <div className="resize-handle top" onPointerDown={(e) => onResizeStart(e, 'top')} title="Drag to change the start date" />}

      <div className="block-inner" ref={innerRef}>
        <header className="block-head">
          <span className={`pill pill-${block.state}`}>{stateLabel(block.state)}</span>
          {locked && (
            <span className="pill pill-locked">
              <Lock width="12" height="12" /> Locked
            </span>
          )}
          <span className="block-span">
            {formatLong(block.start_date)} → {formatLong(block.end_date)}
          </span>
          {canEdit && (
            <button className="icon-btn danger" onClick={() => onDelete(block.id)} title="Delete block">
              <Trash width="15" height="15" />
            </button>
          )}
        </header>

        {canEdit ? (
          <input
            className="block-title-input"
            value={title}
            placeholder="Untitled block"
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => title !== block.title && onPatch(block.id, { title })}
            onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
          />
        ) : (
          <h3 className="block-title">{block.title}</h3>
        )}

        {canEdit ? (
          <AutoTextarea
            value={description}
            placeholder="Add a description…"
            onChange={setDescription}
            onCommit={() => description !== block.description && onPatch(block.id, { description })}
          />
        ) : (
          <p className="block-desc">
            <Linkify text={block.description} />
          </p>
        )}

        {(canEdit || canSetState) && (
          <div className="block-controls">
            {canSetState && (
              <label className="ctl">
                <span>State</span>
                {/* Admin only. 'Approved' is deliberately not offered — it is the
                    result of an approval, not a state you can pick. */}
                <select value={block.state} onChange={(e) => onState(block.id, e.target.value)}>
                  {SELECTABLE_STATES.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {canEdit && (
              <>
                <label className="ctl">
                  <span>Start</span>
                  <input
                    type="date"
                    value={block.start_date}
                    max={block.end_date}
                    onChange={(e) => e.target.value && onPatch(block.id, { start_date: e.target.value })}
                  />
                </label>
                <label className="ctl">
                  <span>Deadline</span>
                  <input
                    type="date"
                    value={block.end_date}
                    min={block.start_date}
                    onChange={(e) => e.target.value && onPatch(block.id, { end_date: e.target.value })}
                  />
                </label>
              </>
            )}
          </div>
        )}

        {/* The Approve action is its own element, not a state. It exists only
            while the block is in Review — Review IS the approval request. */}
        {canApprove && (
          <button className="approve-box" onClick={() => onApprove(block.id)}>
            <span className="approve-check" aria-hidden="true">
              <Check width="14" height="14" />
            </span>
            <span className="approve-copy">
              <strong>Approve this block</strong>
              <em>Locks it for everyone and counts toward finishing the phase.</em>
            </span>
          </button>
        )}

        {block.state === 'review' && !canApprove && !locked && (
          <p className="await-note">Waiting on approval.</p>
        )}

        {locked && approval && (
          <div className="approved-stamp">
            <span className="approve-check done" aria-hidden="true">
              <Check width="14" height="14" />
            </span>
            Approved by {approverEmail || 'a reviewer'} · {formatStamp(approval.approved_at)}
          </div>
        )}
      </div>

      {canEdit && (
        <div className="resize-handle bottom" onPointerDown={(e) => onResizeStart(e, 'bottom')} title="Drag to change the deadline" />
      )}
    </article>
  )
}

/** Viewers read the description — any URL in it opens in a new tab.
 *  (File attachments land here later: an `attachments` table -> Supabase Storage
 *  signed URLs, rendered with the same treatment.) */
function Linkify({ text }) {
  const parts = String(text ?? '').split(/(https?:\/\/[^\s]+)/g)
  return parts.map((part, i) =>
    /^https?:\/\//.test(part) ? (
      <a key={i} href={part} target="_blank" rel="noopener noreferrer" className="block-link">
        {part.replace(/^https?:\/\//, '')}
      </a>
    ) : (
      <span key={i}>{part}</span>
    )
  )
}

function AutoTextarea({ value, onChange, onCommit, placeholder }) {
  const ref = useRef(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [value])
  return (
    <textarea
      ref={ref}
      className="block-desc-input"
      rows={1}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      onBlur={onCommit}
    />
  )
}
