import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Press and hold, then either drag or let go. For touch only.
 *
 * One gesture does both jobs because they are the same gesture on a phone:
 * hold a thing to pick it up, move it to reorder, let go without moving to be
 * asked about it. A mouse never gets here — it has a grip and a bin already.
 *
 * The fiddly parts, in order of how much trouble they caused:
 *
 *   - A finger that moves BEFORE the hold lands is scrolling the row, not
 *     pressing it, so the timer is dropped. After the hold lands, the same
 *     movement is a drag. The timer is the only thing telling them apart.
 *   - Once it has landed the page must stop scrolling underneath, or the
 *     finger drags the strip instead of the thing it picked up. That needs a
 *     non-passive touchmove listener; `touch-action: none` in the stylesheet
 *     would kill the strip's own scrolling the rest of the time.
 *   - Letting go fires a click. Without swallowing it, releasing over another
 *     row would also select it.
 */
const dist = (e, from) => Math.hypot(e.clientX - from.x, e.clientY - from.y)

export function useHoldDrag({ onHoldStart, onHoldMove, onRelease, ms = 450, slop = 10 } = {}) {
  const timer = useRef(null)
  const from = useRef(null)
  const held = useRef(false)
  const moved = useRef(false)
  const eatClick = useRef(false)
  const [holding, setHolding] = useState(false)

  const clearTimer = () => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
  }

  const finish = useCallback(
    (cancelled) => {
      clearTimer()
      if (held.current) {
        eatClick.current = true
        if (!cancelled) onRelease?.(moved.current)
      }
      held.current = false
      moved.current = false
      from.current = null
      setHolding(false)
    },
    [onRelease]
  )

  useEffect(() => {
    if (!holding) return
    const stop = (e) => e.preventDefault()
    document.addEventListener('touchmove', stop, { passive: false })
    return () => document.removeEventListener('touchmove', stop)
  }, [holding])

  useEffect(() => clearTimer, [])

  return {
    holding,
    handlers: {
      onPointerDown(e) {
        if (e.pointerType !== 'touch') return
        const node = e.currentTarget
        const id = e.pointerId
        from.current = { x: e.clientX, y: e.clientY }
        held.current = false
        moved.current = false
        timer.current = setTimeout(() => {
          timer.current = null
          held.current = true
          setHolding(true)
          // Follow this finger wherever it goes, even off the element.
          try {
            node.setPointerCapture(id)
          } catch {
            /* the pointer is already gone */
          }
          onHoldStart?.()
        }, ms)
      },
      onPointerMove(e) {
        if (held.current) {
          // The same slop again on the other side of the hold: a finger
          // resting on a pill is never perfectly still, and without this the
          // shake of letting go would read as a drag and swallow the question.
          if (!moved.current && from.current && dist(e, from.current) <= slop) return
          moved.current = true
          onHoldMove?.(e)
          return
        }
        if (!from.current) return
        if (dist(e, from.current) > slop) {
          clearTimer()
          from.current = null
        }
      },
      onPointerUp() {
        finish(false)
      },
      onPointerCancel() {
        finish(true)
      },
      onClickCapture(e) {
        if (!eatClick.current) return
        eatClick.current = false
        e.preventDefault()
        e.stopPropagation()
      }
    }
  }
}
