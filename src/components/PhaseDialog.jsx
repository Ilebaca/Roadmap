import { useEffect, useRef, useState } from 'react'

/**
 * What a held phase pill opens: one sheet with both of the things you can do
 * to a phase.
 *
 * Holding it used to ask one question — delete it, yes or no — which meant the
 * only thing a phase's own menu offered was its destruction, and renaming one
 * could not be done on a phone at all. Both live here now, in the order you
 * are likely to want them: the name first, with the way to get rid of it
 * underneath and set apart.
 *
 * The sheet is the confirmation. It takes a deliberate hold to open and the
 * cost of deleting is written beside the button, so there is no second dialog
 * on top of this one asking the same thing again.
 */
export default function PhaseDialog({ title, note, value, onRename, onDelete, onClose }) {
  const [name, setName] = useState(value)
  const closeRef = useRef(null)

  useEffect(() => {
    // The close button takes focus, not the field: on a phone, focusing the
    // field throws the keyboard up over the half of the sheet you have not
    // read yet.
    closeRef.current?.focus()
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const clean = name.trim()
  const changed = clean && clean !== value

  const save = (e) => {
    e.preventDefault()
    if (!changed) return
    onRename(clean)
    onClose()
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal confirm sheet"
        role="dialog"
        aria-modal="true"
        aria-label={`Phase: ${title}`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* The name is in the field below, so the heading says what kind of
            thing this is rather than saying the name twice — and the field
            needs no label of its own under a heading that says Phase, with a
            button under it that says Save name. */}
        <p className="sheet-eyebrow">Phase</p>

        <form className="sheet-form" onSubmit={save}>
          <input
            aria-label="Phase name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Phase name"
            enterKeyHint="done"
          />
          <div className="sheet-actions">
            <button type="submit" className="primary-btn" disabled={!changed}>
              Save name
            </button>
            <button type="button" className="ghost-btn" ref={closeRef} onClick={onClose}>
              Close
            </button>
          </div>
        </form>

        <section className="sheet-danger">
          <h4>Delete this phase</h4>
          {note && <p>{note}</p>}
          <button className="danger-btn" onClick={onDelete}>
            Delete phase
          </button>
        </section>
      </div>
    </div>
  )
}
