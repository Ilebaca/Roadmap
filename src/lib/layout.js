import { addDays, daysBetween, overdue, todayISO } from './dates'

/**
 * Timeline geometry.
 * ---------------------------------------------------------------------------
 * One continuous line carries every phase, start to finish. A block hangs off
 * its start dot and reaches to its end dot.
 *
 * Everything here is laid out along ONE axis and says nothing about which way
 * that axis points: a row has a position (`at`) and a length (`len`), and the
 * component decides whether those become top/height or left/width. That is the
 * whole of the difference between the vertical roadmap and the horizontal one.
 *
 * The line is a SEQUENCE of dates, not a proportional scale: how far apart two
 * dots sit has nothing to do with how many days lie between them. Two days or
 * two years between them looks exactly the same; the length of a job is read
 * off the numbers, not off the line.
 */

/**
 * The two axes differ only in these numbers.
 *
 * Down the page, a block is as long as its content is tall, so a block with
 * more in it pushes its two dates further apart. Across the page it cannot be:
 * length is width there, and content grows downwards, so every card is the
 * same width and the spacing is even. `fromContent` is that difference.
 */
export const VERTICAL = {
  MIN_BLOCK: 132,
  GAP_AFTER_BLOCK: 72, // end dot -> next start dot
  PHASE_HEADER: 78,
  LOCKED_BANNER: 150,
  SLOT: 116,
  PHASE_GAP: 44,
  LEAD_PAD: 24,
  TAIL_PAD: 120,
  fromContent: true
}

export const HORIZONTAL = {
  MIN_BLOCK: 320,
  GAP_AFTER_BLOCK: 56,
  PHASE_HEADER: 108,
  /* The phase's name sits ON the line, so the stretch of line before its first
     date has to be long enough to hold the chip and still leave a gap before
     that dot. The chip is measured, since a phase can be called anything;
     this is only what is added to whatever it turns out to be. */
  PHASE_HEAD_PAD: 30,
  LOCKED_BANNER: 300,
  SLOT: 140,
  PHASE_GAP: 36,
  LEAD_PAD: 40,
  TAIL_PAD: 220,
  fromContent: false
}

/* A phone is about 390px wide and the rail and margins take some of that, so
   a 320px card is wider than the screen it has to fit on. Everything shrinks
   together — a narrower card with less air around it — rather than the card
   alone, which would leave the gaps looking enormous beside it. */
export const HORIZONTAL_NARROW = {
  ...HORIZONTAL,
  MIN_BLOCK: 252,
  GAP_AFTER_BLOCK: 34,
  PHASE_HEADER: 72,
  /* Less of it: the chip is smaller here, and so is everything around it. */
  PHASE_HEAD_PAD: 22,
  LOCKED_BANNER: 220,
  SLOT: 104,
  PHASE_GAP: 24,
  LEAD_PAD: 20,
  TAIL_PAD: 120
}

export const METRICS = {
  vertical: VERTICAL,
  horizontal: HORIZONTAL,
  horizontalNarrow: HORIZONTAL_NARROW
}

/** Drag sensitivity only — pixels dragged per day of date change. It is a
 *  feel-of-the-gesture constant, NOT a scale the line is drawn to. */
export const DRAG_PX_PER_DAY = 6

/** Where today sits on an empty roadmap, with the first slot after it. */
export const EMPTY_NOW_AT = 96
export const EMPTY_SLOT_AT = 168

/** How far along the line a block reaches. Its dates never change this. */
export function blockExtent(measured, m) {
  return m.fromContent ? Math.round(Math.max(m.MIN_BLOCK, measured)) : m.MIN_BLOCK
}

/**
 * Walks phases in order and lays everything out on a single y-axis.
 *
 * @param phases   ordered phase rows
 * @param blocks   every block row for the project
 * @param gates    from computePhaseGates()
 * @param heights  { [blockId]: measured content length in px }
 * @param drag     optional live preview: { blockId, start_date, end_date }
 * @param canCreate whether to draw the dashed "+" slots (admin only)
 * @param phaseHeads { [phaseId]: measured width of the phase's name chip }
 * @param metrics  VERTICAL or HORIZONTAL — the only thing that differs
 */
export function buildLayout({ phases, blocks, gates, heights = {}, phaseHeads = {}, drag = null, canCreate = false, metrics = VERTICAL }) {
  const m = metrics
  const rows = []
  const dots = []
  const phaseOffsets = {}
  let at = m.LEAD_PAD
  // The deadline of the block in front of the one being laid out. A block can
  // never start before it, which is what the drag and the date picker clamp to.
  let chainFloor = null

  const ordered = [...phases].sort((a, b) => a.order_index - b.order_index)

  for (const phase of ordered) {
    const gate = gates[phase.id] ?? { unlocked: false, complete: false }
    const start = at

    // Long enough for the name to sit on the line without reaching the first
    // dot of the phase. Until the chip has been measured the fixed minimum
    // stands in, which is also all the vertical layout ever needed.
    const head = Math.max(m.PHASE_HEADER, (phaseHeads[phase.id] ?? 0) + (m.PHASE_HEAD_PAD ?? 0))
    rows.push({ key: `ph-${phase.id}`, type: 'phase', phase, gate, at, len: head })
    at += head

    if (!gate.unlocked) {
      // Locked phases keep the line running but show nothing of their contents.
      rows.push({ key: `lk-${phase.id}`, type: 'locked', phase, at, len: m.LOCKED_BANNER })
      at += m.LOCKED_BANNER + m.PHASE_GAP
      phaseOffsets[phase.id] = { start, end: at }
      continue
    }

    const mine = blocks
      .filter((b) => b.phase_id === phase.id)
      .map((b) => (drag && drag.blockId === b.id ? { ...b, start_date: drag.start_date, end_date: drag.end_date } : b))
      .sort((a, b) => a.start_date.localeCompare(b.start_date) || a.order_index - b.order_index)

    for (const block of mine) {
      const len = blockExtent(heights[block.id] || 0, m)
      rows.push({ key: `bk-${block.id}`, type: 'block', block, phase, at, len, minStart: chainFloor })
      chainFloor = block.end_date
      dots.push({ key: `d-${block.id}-s`, at, date: block.start_date, kind: 'start', blockId: block.id, state: block.state })
      // While a block runs past its deadline its end dot walks forward with
      // today, so the line shows where the work has actually got to. The row
      // itself still holds the date that was agreed.
      dots.push({
        key: `d-${block.id}-e`,
        at: at + len,
        date: overdue(block).effectiveEnd,
        kind: 'end',
        blockId: block.id,
        state: block.state
      })
      at += len + m.GAP_AFTER_BLOCK
    }

    if (canCreate) {
      // An empty date slot: the dashed plus placeholder.
      const last = mine.at(-1)
      const start = last ? addDays(last.end_date, 1) : phaseStartGuess(ordered, phase, blocks, chainFloor)
      rows.push({
        key: `sl-${phase.id}`,
        type: 'slot',
        phase,
        at,
        len: m.SLOT,
        start_date: start,
        end_date: addDays(start, 7)
      })
      dots.push({ key: `d-slot-${phase.id}`, at, date: start, kind: 'slot' })
      at += m.SLOT
    }

    at += m.PHASE_GAP
    phaseOffsets[phase.id] = { start, end: at }
  }

  return { rows, dots, phaseOffsets, total: at + m.TAIL_PAD }
}

function phaseStartGuess(ordered, phase, blocks, chainFloor) {
  // The first block of an empty phase starts when the work before it finishes.
  if (chainFloor) return addDays(chainFloor, 1)
  const earlier = ordered.filter((p) => p.order_index < phase.order_index).map((p) => p.id)
  const ends = blocks.filter((b) => earlier.includes(b.phase_id)).map((b) => b.end_date).sort()
  return ends.length ? addDays(ends.at(-1), 1) : todayISO()
}

/**
 * The labels to draw for a run of dots, with the clashes merged.
 *
 * Dots come in pairs — a block's start and its end — and only a gap separates
 * one block's end from the next one's start, so two labels there will always
 * be on top of each other. Rather than dropping one and losing the date, dots
 * too close to label separately share a label spanning them: one date if they
 * fall on the same day, a range if they do not.
 *
 * Grouping is measured from the first dot of a group, never the last, so a
 * long run of near dots cannot chain into one label wider than the gap.
 */
export function dateLabels(dots, minGap) {
  const groups = []
  for (const dot of [...dots].sort((a, b) => a.at - b.at)) {
    const last = groups.at(-1)
    if (last && dot.at - last.from <= minGap) {
      last.to = dot.at
      last.dates.push(dot.date)
      // A group is only the faint "nothing scheduled" grey if every dot in it is.
      last.slot = last.slot && dot.kind === 'slot'
    } else {
      groups.push({ from: dot.at, to: dot.at, dates: [dot.date], slot: dot.kind === 'slot' })
    }
  }
  return groups.map((g) => ({
    key: `lb-${g.from}-${g.dates[0]}`,
    at: (g.from + g.to) / 2,
    dates: g.dates,
    slot: g.slot
  }))
}

/**
 * Where "today" falls on the line. Dots carry dates and positions, so the
 * marker interpolates between the two dots it sits between. Since the line is
 * not a proportional scale there is nothing to extrapolate along past the ends:
 * before the first date or after the last it simply parks at that end, dimmed.
 */
export function nowMarker(dots, total, today = todayISO()) {
  // An empty roadmap still shows the line and today on it — there is simply
  // nothing else to place it between.
  if (!dots.length) return { at: EMPTY_NOW_AT, date: today, clamped: false }
  const sorted = [...dots].sort((a, b) => a.at - b.at)
  const first = sorted[0]
  const last = sorted.at(-1)

  if (daysBetween(today, first.date) > 0) {
    return { at: Math.max(8, first.at - 26), date: today, clamped: true }
  }
  if (daysBetween(last.date, today) > 0) {
    return { at: Math.min(total - 8, last.at + 26), date: today, clamped: true }
  }

  for (let i = 1; i < sorted.length; i++) {
    const a = sorted[i - 1]
    const b = sorted[i]
    if (daysBetween(a.date, today) < 0 || daysBetween(today, b.date) < 0) continue
    const span = daysBetween(a.date, b.date)
    const t = span === 0 ? 0 : daysBetween(a.date, today) / span
    return { at: a.at + (b.at - a.at) * t, date: today, clamped: false }
  }
  return { at: last.at, date: today, clamped: false }
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

/** Pixels dragged -> a new date, snapped. The card does not move with the
 *  cursor; the dates in its corner and the readout pill are the feedback. */
export function dateFromDrag(originDate, deltaPx, snapDates) {
  const days = Math.round(deltaPx / DRAG_PX_PER_DAY)
  return snapDate(addDays(originDate, days), snapDates)
}
