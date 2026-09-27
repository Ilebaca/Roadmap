import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { formatRange, formatStamp } from '../lib/dates'
import { Check, Link as LinkIcon, Pen, Plus, Trash, X, Lock } from './Icons'
import StateSelect from './StateSelect'
import OwnerSwitch from './OwnerSwitch'
import ConfirmDialog from './ConfirmDialog'

/**
 * A single content block hanging off the date line.
 *
 * Down the page it is as tall as the layout says, and it measures its own
 * content and reports back so the layout can push its two dots apart. Across
 * the page that reverses: the layout fixes its width, its height is whatever
 * the content needs, and there is nothing to report — so it does not measure,
 * which also stops it feeding a height into a layout that would ignore it.
 */
export default function BlockCard({
  block,
  standing = 'active',
  extent,
  horizontal = false,
  minStart,
  canEdit,
  canSetState,
  canApprove,
  canUnapprove,
  approval,
  approverEmail,
  links,
  dragging,
  onMeasure,
  onPatch,
  onState,
  onApprove,
  onUnapprove,
  onDelete,
  onAddLink,
  onRemoveLink,
  onResizeStart
}) {
  const innerRef = useRef(null)
  const [title, setTitle] = useState(block.title)
  const [description, setDescription] = useState(block.description)
  const [editingDates, setEditingDates] = useState(false)
  const [confirming, setConfirming] = useState(false)

  // Keep local edit buffers in sync when the row changes underneath us.
  useEffect(() => setTitle(block.title), [block.title])
  useEffect(() => setDescription(block.description), [block.description])

  // Report the content's natural height so the layout can size this block.
  // Only down the page — across it, width is set and height is free.
  useLayoutEffect(() => {
    const el = innerRef.current
    if (!el || horizontal) return
    const report = () => onMeasure(block.id, el.offsetHeight)
    report()
    const ro = new ResizeObserver(report)
    ro.observe(el)
    return () => ro.disconnect()
  }, [block.id, onMeasure, horizontal])

  const locked = block.locked
  // Not started because its turn has not come. Distinct from `locked`, which
  // means signed off and closed.
  const waiting = standing === 'future'

  // Work that has not started reads as To Do whatever the row happens to say.
  // A block can be pushed back into the queue — by a new block landing in
  // front of it, or by an earlier approval being withdrawn — and it would
  // otherwise sit there claiming to be In Progress while nobody can touch it.
  // The stored state is left alone, so it picks up where it left off when its
  // turn comes round again.
  const shownState = waiting ? 'todo' : block.state

  return (
    <article
      className={`block state-${shownState} ${locked ? 'is-locked' : ''} ${waiting ? 'is-waiting' : ''} ${dragging ? 'is-dragging' : ''}`}
      style={horizontal ? undefined : { height: extent }}
    >
      {canEdit && <div className="resize-handle top" onPointerDown={(e) => onResizeStart(e, 'top')} title="Drag to change the start date" />}

      <div className="block-inner" ref={innerRef}>
        <header className="block-head">
          {/* Top-left: delete while the block is open for work, and the approved
              mark once it is signed off. Never both. */}
          {locked ? (
            <span className="approved-mark" title="Approved and locked">
              <Check width="12" height="12" />
              Approved
            </span>
          ) : canEdit ? (
            <button className="icon-btn danger" onClick={() => setConfirming(true)} title="Delete block">
              <Trash width="14" height="14" />
            </button>
          ) : (
            <span className="head-spacer" />
          )}

          {/* Start date and deadline live in the top-right corner. The pen
              swaps them for two date pickers (admin only, unlocked only). */}
          <div className={`block-dates ${editingDates ? 'is-editing' : ''}`}>
            {editingDates ? (
              <>
                <input
                  type="date"
                  value={block.start_date}
                  min={minStart || undefined}
                  max={block.end_date}
                  onChange={(e) => e.target.value && onPatch(block.id, { start_date: e.target.value })}
                  title={minStart ? `Cannot start before ${minStart} — the block in front finishes then` : undefined}
                />
                <span className="arrow">–</span>
                <input
                  type="date"
                  value={block.end_date}
                  min={block.start_date}
                  onChange={(e) => e.target.value && onPatch(block.id, { end_date: e.target.value })}
                />
                <button className="icon-btn" onClick={() => setEditingDates(false)} title="Done">
                  <Check width="13" height="13" />
                </button>
              </>
            ) : (
              <>
                <span className="block-span">{formatRange(block.start_date, block.end_date)}</span>
                {canEdit && (
                  <button className="icon-btn" onClick={() => setEditingDates(true)} title="Edit dates">
                    <Pen width="13" height="13" />
                  </button>
                )}
              </>
            )}
          </div>
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

        {/* State sits under the description: a dropdown for an admin, the same
            chip read-only for a viewer. */}
        <div className="state-row">
          <StateSelect
            value={shownState}
            editable={canSetState}
            onChange={(next) => onState(block.id, next)}
          />
          {/* Whose job this is. The commonest way a roadmap stalls is both
              sides waiting on the other, so every block says out loud which
              of them it is on. */}
          <OwnerSwitch
            value={block.owner ?? 'studio'}
            editable={canEdit}
            onChange={(next) => onPatch(block.id, { owner: next })}
          />
          {/* Why the state cannot be moved: it is not this block's turn. */}
          {waiting && !locked && (
            <span className="waiting-note">
              <Lock width="11" height="11" />
              Starts when the one before it is approved
            </span>
          )}
        </div>

        {(links.length > 0 || canEdit) && (
          <LinkShelf
            blockId={block.id}
            links={links}
            canEdit={canEdit}
            onAddLink={onAddLink}
            onRemoveLink={onRemoveLink}
          />
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
            <span>
              Signed off by {approverEmail || 'a reviewer'} · {formatStamp(approval.approved_at)}
            </span>
            {/* Admin can withdraw the approval: the block unlocks, goes back to
                In Progress, and any phase that depended on it re-locks. */}
            {canUnapprove && (
              <button className="unapprove-btn" onClick={() => onUnapprove(block.id)}>
                Unapprove
              </button>
            )}
          </div>
        )}
      </div>

      {confirming && (
        <ConfirmDialog
          title={`Delete "${block.title || 'this block'}"?`}
          body="Its links go with it. This cannot be undone."
          confirmLabel="Delete block"
          onCancel={() => setConfirming(false)}
          onConfirm={() => {
            setConfirming(false)
            onDelete(block.id)
          }}
        />
      )}

      {canEdit && (
        <div className="resize-handle bottom" onPointerDown={(e) => onResizeStart(e, 'bottom')} title="Drag to change the deadline" />
      )}
    </article>
  )
}

/**
 * Dedicated space for the block's links and files. Viewers open them; admins
 * add and remove them while the block is unlocked.
 */
function LinkShelf({ blockId, links, canEdit, onAddLink, onRemoveLink }) {
  const [adding, setAdding] = useState(false)
  const [label, setLabel] = useState('')
  const [url, setUrl] = useState('')

  const submit = (e) => {
    e.preventDefault()
    const clean = url.trim()
    if (!clean) return
    onAddLink(blockId, label.trim(), /^https?:\/\//i.test(clean) ? clean : `https://${clean}`)
    setLabel('')
    setUrl('')
    setAdding(false)
  }

  return (
    <div className="link-shelf">
      <span className="shelf-label">Links &amp; files</span>

      {links.length > 0 ? (
        <ul className="link-list">
          {links.map((l) => (
            <li key={l.id}>
              <a href={l.url} target="_blank" rel="noopener noreferrer" className="link-chip">
                <LinkIcon width="12" height="12" />
                {l.label}
              </a>
              {canEdit && (
                <button className="icon-btn tiny" onClick={() => onRemoveLink(l.id)} title="Remove link">
                  <X width="11" height="11" />
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        !adding && <p className="shelf-empty">{canEdit ? 'Nothing attached yet.' : 'No links yet.'}</p>
      )}

      {canEdit &&
        (adding ? (
          <form className="link-form" onSubmit={submit}>
            <input autoFocus value={label} placeholder="Label" onChange={(e) => setLabel(e.target.value)} />
            <input value={url} placeholder="https://…" onChange={(e) => setUrl(e.target.value)} />
            <button type="submit" className="link-add-confirm">
              Add
            </button>
            <button type="button" className="icon-btn tiny" onClick={() => setAdding(false)} title="Cancel">
              <X width="11" height="11" />
            </button>
          </form>
        ) : (
          <button className="link-add" onClick={() => setAdding(true)}>
            <Plus width="11" height="11" /> Add link or file
          </button>
        ))}
    </div>
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
