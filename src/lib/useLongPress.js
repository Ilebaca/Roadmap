import { useCallback, useEffect, useRef } from 'react'

/**
 * Hold a thing to act on it. For touch only.
 *
 * A delete button that is always visible has to be given room, and on a pill
 * the size of its own label there is none — it ends up over the last letter.
 * A press instead needs no room at all.
 *
 * Three things make it behave:
 *   - a mouse is ignored, because a pointer has the button already;
 *   - a finger that moves is scrolling, not pressing, so the timer is dropped;
 *   - the tap that follows the press is swallowed, or letting go would also
 *     count as a click and select the very thing being asked about.
 */
export function useLongPress(onLongPress, { ms = 500, slop = 10 } = {}) {
  const timer = useRef(null)
  const from = useRef(null)
  const fired = useRef(false)

  const cancel = useCallback(() => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    from.current = null
  }, [])

  useEffect(() => cancel, [cancel])

  return {
    onPointerDown(e) {
      if (e.pointerType !== 'touch') return
      fired.current = false
      from.current = { x: e.clientX, y: e.clientY }
      timer.current = setTimeout(() => {
        timer.current = null
        fired.current = true
        onLongPress()
      }, ms)
    },
    onPointerMove(e) {
      if (!from.current) return
      if (Math.hypot(e.clientX - from.current.x, e.clientY - from.current.y) > slop) cancel()
    },
    onPointerUp: cancel,
    onPointerCancel: cancel,
    onClickCapture(e) {
      if (!fired.current) return
      e.preventDefault()
      e.stopPropagation()
      fired.current = false
    }
  }
}
