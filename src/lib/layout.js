import { addDays, daysBetween, todayISO } from './dates'

/**
 * Timeline geometry.
 * ---------------------------------------------------------------------------
 * One continuous vertical line carries every phase, top to bottom. A block hangs
 * off its start dot by its top-left corner.
 *
 * Two different heights are at play:
 *   - the CARD is only ever as tall as its own content (with a floor). A long
 *     deadline never stretches it into an empty box.
 *   - the SEGMENT is the distance from the start dot to the end dot: the date
 *     span in pixels, or the card height when the card is the taller of the two.
 *
 * So content pushes the two dates apart, and a longer deadline just walks the
 * end dot further down the line while the card stays put. A rail drawn on the
 * line between the two dots shows the duration.
 */

export const PX_PER_DAY = 5.5
export const MIN_BLOCK_H = 132
export const GAP_AFTER_BLOCK = 72 // end dot -> next start dot
export const PHASE_HEADER_H = 78
export const LOCKED_BANNER_H = 150
export const SLOT_H = 116
export const PHASE_GAP = 44
export const TOP_PAD = 24
export const BOTTOM_PAD = 120

/** The card itself: its content, never its dates. */
export function blockHeight(block, contentHeight = 0) {
  return Math.round(Math.max(MIN_BLOCK_H, contentHeight))
}

/** Start dot to end dot: the date span, or the card when the card is taller. */
export function blockSegment(block, cardHeight) {
  const span = Math.max(1, daysBetween(block.start_date, block.end_date)) * PX_PER_DAY
  return Math.round(Math.max(cardHeight, span))
}

/**
 * Walks phases in order and lays everything out on a single y-axis.
 *
 * @param phases   ordered phase rows
 * @param blocks   every block row for the project
 * @param gates    from computePhaseGates()
 * @param heights  { [blockId]: measured content height in px }
 * @param drag     optional live preview: { blockId, start_date, end_date }
 * @param canCreate whether to draw the dashed "+" slots (admin only)
 */
export function buildLayout({ phases, blocks, gates, heights = {}, drag = null, canCreate = false }) {
  const rows = []
  const dots = []
  const phaseOffsets = {}
  let y = TOP_PAD
  // The deadline of the block in front of the one being laid out. A block can
  // never start before it, which is what the drag and the date picker clamp to.
  let chainFloor = null

  const ordered = [...phases].sort((a, b) => a.order_index - b.order_index)

  for (const phase of ordered) {
    const gate = gates[phase.id] ?? { unlocked: false, complete: false }
    const top = y

    rows.push({ key: `ph-${phase.id}`, type: 'phase', phase, gate, y, h: PHASE_HEADER_H })
    y += PHASE_HEADER_H

    if (!gate.unlocked) {
      // Locked phases keep the line running but show nothing of their contents.
      rows.push({ key: `lk-${phase.id}`, type: 'locked', phase, y, h: LOCKED_BANNER_H })
      y += LOCKED_BANNER_H + PHASE_GAP
      phaseOffsets[phase.id] = { top, bottom: y }
      continue
    }

    const mine = blocks
      .filter((b) => b.phase_id === phase.id)
      .map((b) => (drag && drag.blockId === b.id ? { ...b, start_date: drag.start_date, end_date: drag.end_date } : b))
      .sort((a, b) => a.start_date.localeCompare(b.start_date) || a.order_index - b.order_index)

    for (const block of mine) {
      const h = blockHeight(block, heights[block.id] || 0)
      const seg = blockSegment(block, h)
      rows.push({ key: `bk-${block.id}`, type: 'block', block, phase, y, h, seg, minStart: chainFloor })
      chainFloor = block.end_date
      dots.push({ key: `d-${block.id}-s`, y, date: block.start_date, kind: 'start', blockId: block.id, state: block.state })
      dots.push({ key: `d-${block.id}-e`, y: y + seg, date: block.end_date, kind: 'end', blockId: block.id, state: block.state })
      y += seg + GAP_AFTER_BLOCK
    }

    if (canCreate) {
      // An empty date slot: the dashed plus placeholder.
      const last = mine.at(-1)
      const start = last ? addDays(last.end_date, 1) : phaseStartGuess(ordered, phase, blocks, chainFloor)
      rows.push({
        key: `sl-${phase.id}`,
        type: 'slot',
        phase,
        y,
        h: SLOT_H,
        start_date: start,
        end_date: addDays(start, 7)
      })
      dots.push({ key: `d-slot-${phase.id}`, y, date: start, kind: 'slot' })
      y += SLOT_H
    }

    y += PHASE_GAP
    phaseOffsets[phase.id] = { top, bottom: y }
  }

  return { rows, dots, phaseOffsets, totalHeight: y + BOTTOM_PAD }
}

function phaseStartGuess(ordered, phase, blocks, chainFloor) {
  // The first block of an empty phase starts when the work before it finishes.
  if (chainFloor) return addDays(chainFloor, 1)
  const earlier = ordered.filter((p) => p.order_index < phase.order_index).map((p) => p.id)
  const ends = blocks.filter((b) => earlier.includes(b.phase_id)).map((b) => b.end_date).sort()
  return ends.length ? addDays(ends.at(-1), 1) : todayISO()
}

/**
 * Where "today" falls on the line. Dots carry dates and y positions, so the
 * marker is a straight interpolation between the two dots it sits between;
 * outside the range it extrapolates at the line's own px-per-day scale.
 */
export function nowMarker(dots, totalHeight, today = todayISO()) {
  if (!dots.length) return null
  const sorted = [...dots].sort((a, b) => a.y - b.y)
  const first = sorted[0]
  const last = sorted.at(-1)

  if (daysBetween(today, first.date) > 0) {
    const y = first.y - daysBetween(today, first.date) * PX_PER_DAY
    return { y: Math.max(6, y), date: today, clamped: y < 6 }
  }
  if (daysBetween(last.date, today) > 0) {
    const y = last.y + daysBetween(last.date, today) * PX_PER_DAY
    const max = totalHeight - 6
    return { y: Math.min(max, y), date: today, clamped: y > max }
  }

  for (let i = 1; i < sorted.length; i++) {
    const a = sorted[i - 1]
    const b = sorted[i]
    if (daysBetween(a.date, today) < 0 || daysBetween(today, b.date) < 0) continue
    const span = daysBetween(a.date, b.date)
    const t = span === 0 ? 0 : daysBetween(a.date, today) / span
    return { y: a.y + (b.y - a.y) * t, date: today, clamped: false }
  }
  return { y: last.y, date: today, clamped: false }
}

/**
 * Snap a dragged date to a nearby dot on the line, so edges click onto the next
 * date — and past it to the one after, anywhere along the line.
 */
export function snapDate(candidate, snapDates, toleranceDays = 3) {
  let best = null
  let bestDist = Infinity
  for (const d of snapDates) {
    const dist = Math.abs(daysBetween(candidate, d))
    if (dist < bestDist) {
      bestDist = dist
      best = d
    }
  }
  return bestDist <= toleranceDays && best ? best : candidate
}

/** Pixels dragged -> a new date, snapped. */
export function dateFromDrag(originDate, deltaPx, snapDates) {
  const days = Math.round(deltaPx / PX_PER_DAY)
  return snapDate(addDays(originDate, days), snapDates)
}
