import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { addMonths, formatMonth, monthGrid, todayISO } from '../lib/dates'
import { Chevron } from './Icons'
import { eventInside } from '../lib/dom'

const WEEK = ['M', 'T', 'W', 'T', 'F', 'S', 'S']

/**
 * The app's own calendar.
 *
 * It replaces `input[type=date]`, which was two problems in one control. It
 * looks like the browser rather than like this app — a different typeface, a
 * different blue, a different idea of a shadow, in the middle of a page that
 * has none of those. And it only opens from its own small indicator: clicking
 * the day number puts a cursor in a segment instead, so the obvious way to
 * change a date did nothing at all.
 *
 * Fixed-positioned and measured from the trigger, the same as the state menu,
 * because a block clips its own overflow. Closed by Escape, by a press
 * outside, and by any scroll after the one the opening click caused.
 */
export default function DatePicker({ value, min, max, anchorRef, onPick, onClose }) {
  const today = todayISO()
  const [month, setMonth] = useState(value || today)
  const [at, setAt] = useState(null)
  const ref = useRef(null)

  useLayoutEffect(() => {
    const el = anchorRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const W = 252
    const H = 316
    const below = window.innerHeight - r.bottom
    setAt({
      // Kept on screen: a calendar hanging off the side of a phone is no use,
      // and the field it belongs to can be anywhere along a scrolling line.
      left: Math.min(Math.max(8, r.left), window.innerWidth - W - 8),
      top: below > H + 12 ? r.bottom + 6 : Math.max(8, r.top - H - 6),
      width: W
    })
  }, [anchorRef])

  useEffect(() => {
    const opened = Date.now()
    const onKey = (e) => e.key === 'Escape' && onClose()
    const onScroll = () => Date.now() - opened > 200 && onClose()
    const onDown = (e) => {
      if (eventInside(ref.current, e) || eventInside(anchorRef.current, e)) return
      onClose()
    }
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', onClose)
    window.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onDown, true)
    return () => {
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', onClose)
      window.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', onDown, true)
    }
  }, [onClose, anchorRef])

  if (!at) return null
  const days = monthGrid(month)
  const blocked = (iso) => (min && iso < min) || (max && iso > max)

  return (
    <div ref={ref} className="cal" style={at} role="dialog" aria-label="Pick a date">
      <div className="cal-head">
        <button
          className="icon-btn"
          onClick={() => setMonth(addMonths(month, -1))}
          aria-label="Previous month"
        >
          <Chevron width="13" height="13" className="cal-prev" />
        </button>
        <span className="cal-month">{formatMonth(month)}</span>
        <button
          className="icon-btn"
          onClick={() => setMonth(addMonths(month, 1))}
          aria-label="Next month"
        >
          <Chevron width="13" height="13" className="cal-next" />
        </button>
      </div>

      <div className="cal-week" aria-hidden>
        {WEEK.map((d, i) => (
          <span key={i}>{d}</span>
        ))}
      </div>

      <div className="cal-grid">
        {days.map((d) => (
          <button
            key={d.iso}
            className={`cal-day ${d.outside ? 'is-outside' : ''} ${d.iso === value ? 'is-picked' : ''} ${
              d.iso === today ? 'is-today' : ''
            }`}
            disabled={blocked(d.iso)}
            aria-current={d.iso === value ? 'date' : undefined}
            onClick={() => {
              onPick(d.iso)
              onClose()
            }}
          >
            {d.day}
          </button>
        ))}
      </div>
    </div>
  )
}
