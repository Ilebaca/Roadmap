import { addDays, daysBetween } from './dates'

/**
 * Timeline geometry.
 * ---------------------------------------------------------------------------
 * One continuous vertical line carries every phase, top to bottom. A block hangs
 * off its start dot (top-left corner, with a gap) and stretches down to its end
 * dot — so the distance between two dots IS the block's height. Height is the
 * larger of: its date span in pixels, its content's natural height, or a floor.
 * That is what makes a block with more content push its two dates further apart.
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

/** Pixel height a block wants, given its dates and its measured content. */
export function blockHeight(block, contentHeight = 0) {
  const span = Math.max(1, daysBetween(block.start_date, block.end_date)) * PX_PER_DAY
  return Math.round(Math.max(MIN_BLOCK_H, contentHeight, span))
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
      rows.push({ key: `bk-${block.id}`, type: 'block', block, phase, y, h })
      dots.push({ key: `d-${block.id}-s`, y, date: block.start_date, kind: 'start', blockId: block.id, state: block.state })
      dots.push({ key: `d-${block.id}-e`, y: y + h, date: block.end_date, kind: 'end', blockId: block.id, state: block.state })
      y += h + GAP_AFTER_BLOCK
    }

    if (canCreate) {
      // An empty date slot: the dashed plus placeholder.
      const last = mine.at(-1)
      const start = last ? addDays(last.end_date, 3) : phaseStartGuess(ordered, phase, blocks)
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

function phaseStartGuess(ordered, phase, blocks) {
  // First block of an empty phase starts a few days after the previous phase ends.
  const earlier = ordered.filter((p) => p.order_index < phase.order_index).map((p) => p.id)
  const ends = blocks.filter((b) => earlier.includes(b.phase_id)).map((b) => b.end_date).sort()
  return ends.length ? addDays(ends.at(-1), 3) : new Date().toISOString().slice(0, 10)
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
