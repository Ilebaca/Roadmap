import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { SELECTABLE_STATES, stateLabel } from '../lib/permissions'
import { Check, Chevron } from './Icons'

/**
 * The block's state control, sitting under the description.
 * Admin gets the dropdown; a viewer gets the same chip, read-only, so both see
 * the state in exactly the same place with exactly the same colour.
 *
 * The menu is fixed-positioned because a block clips its own overflow — it is
 * measured from the trigger on open and closed again on any scroll.
 */
export default function StateSelect({ value, editable, onChange }) {
  const [open, setOpen] = useState(false)
  const [menu, setMenu] = useState(null)
  const btnRef = useRef(null)
  const menuRef = useRef(null)

  useLayoutEffect(() => {
    if (!open || !btnRef.current) return
    const r = btnRef.current.getBoundingClientRect()
    const height = SELECTABLE_STATES.length * 34 + 10
    const below = window.innerHeight - r.bottom
    setMenu({
      left: r.left,
      top: below > height + 12 ? r.bottom + 6 : r.top - height - 6,
      width: Math.max(r.width, 172)
    })
  }, [open])

  useEffect(() => {
    if (!open) return
    // Clicking the trigger can itself scroll it into view; ignore the scroll
    // that the opening click caused, then close on any scroll after that.
    const opened = Date.now()
    const close = () => setOpen(false)
    const closeOnScroll = () => Date.now() - opened > 200 && setOpen(false)
    const onKey = (e) => e.key === 'Escape' && close()
    const onDown = (e) => {
      if (btnRef.current?.contains(e.target) || menuRef.current?.contains(e.target)) return
      close()
    }
    // `true` catches the timeline's own scroll container too
    window.addEventListener('scroll', closeOnScroll, true)
    window.addEventListener('resize', close)
    window.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onDown, true)
    return () => {
      window.removeEventListener('scroll', closeOnScroll, true)
      window.removeEventListener('resize', close)
      window.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', onDown, true)
    }
  }, [open])

  if (!editable) {
    return (
      <span className={`state-chip tone-${value}`}>
        <i className="state-dot" />
        {stateLabel(value)}
      </span>
    )
  }

  return (
    <>
      <button
        ref={btnRef}
        className={`state-chip tone-${value} is-button ${open ? 'is-open' : ''}`}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <i className="state-dot" />
        {stateLabel(value)}
        <Chevron width="12" height="12" className="state-caret" />
      </button>

      {open && menu && (
        <div ref={menuRef} className="state-menu" style={menu} role="listbox">
          {/* 'Approved' is not here on purpose: it is the result of an
              approval, never something an admin picks. */}
          {SELECTABLE_STATES.map((s) => (
            <button
              key={s.value}
              role="option"
              aria-selected={s.value === value}
              className={`state-option tone-${s.value} ${s.value === value ? 'is-current' : ''}`}
              onClick={() => {
                setOpen(false)
                if (s.value !== value) onChange(s.value)
              }}
            >
              <i className="state-dot" />
              <span>{s.label}</span>
              {s.value === value && <Check width="12" height="12" />}
            </button>
          ))}
        </div>
      )}
    </>
  )
}
