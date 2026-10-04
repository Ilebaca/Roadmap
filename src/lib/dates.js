// Dates are plain 'YYYY-MM-DD' strings everywhere — same as a Postgres `date`
// column, so nothing needs converting when the backend lands.

export const toISO = (d) => {
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export const parse = (iso) => new Date(`${iso}T00:00:00Z`)

export const addDays = (iso, n) => {
  const d = parse(iso)
  d.setUTCDate(d.getUTCDate() + n)
  return toISO(d)
}

export const daysBetween = (a, b) => Math.round((parse(b) - parse(a)) / 86400000)

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "12 Feb" + year on a separate line — used for the labels left of each dot. */
export const formatDot = (iso) => {
  const d = parse(iso)
  return { day: String(d.getUTCDate()).padStart(2, '0'), month: MONTHS[d.getUTCMonth()], year: d.getUTCFullYear() }
}

/**
 * The text of one label on the date line. Dots close enough together to
 * collide share a label, so it sometimes has to stand for more than one day:
 * "30 Oct", "30 - 31 Oct", "30 Oct - 2 Nov".
 */
export const formatDotGroup = (isos) => {
  const sorted = [...new Set(isos)].sort()
  const a = formatDot(sorted[0])
  if (sorted.length === 1) return { day: `${a.day} ${a.month}`, year: String(a.year) }
  const b = formatDot(sorted.at(-1))
  const sameMonth = a.month === b.month && a.year === b.year
  return {
    day: sameMonth ? `${a.day} \u2013 ${b.day} ${b.month}` : `${a.day} ${a.month} \u2013 ${b.day} ${b.month}`,
    year: a.year === b.year ? String(a.year) : `${a.year} \u2013 ${b.year}`
  }
}

export const formatLong = (iso) => {
  const d = parse(iso)
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`
}

/** Compact range for the block's top-right corner: "23 Feb – 6 Mar 2026". */
export const formatRange = (a, b) => {
  // A day's work says its day once. "4 Oct – 4 Oct" is the same date twice
  // with a dash of nothing between them.
  if (a === b) return formatShort(a)
  const s = parse(a)
  const e = parse(b)
  const left = `${s.getUTCDate()} ${MONTHS[s.getUTCMonth()]}${s.getUTCFullYear() === e.getUTCFullYear() ? '' : ` ${s.getUTCFullYear()}`}`
  const right = `${e.getUTCDate()} ${MONTHS[e.getUTCMonth()]} ${e.getUTCFullYear()}`
  return `${left} – ${right}`
}

export const formatStamp = (ts) => {
  const d = new Date(ts)
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`
}

/** Today in the viewer's own timezone (not UTC) — this drives the "now" marker. */
export const todayISO = () => {
  const d = new Date()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

/** "20 Sep" — the label on the now marker. */
export const formatShort = (iso) => {
  const d = parse(iso)
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`
}

/**
 * A block that has run past its deadline.
 *
 * The deadline itself is never rewritten. `end_date` keeps meaning the date
 * that was agreed — which is the thing worth still being able to see once it
 * has gone by — and the date the block actually reaches on the line is worked
 * out here instead. That way it is right the moment the day turns, with no job
 * running at midnight to move anything and nothing that can be left stale.
 *
 * Approved work is never overdue, whenever it was signed off: it is finished,
 * and a finished job that ran late is a fact about the past, not an open one.
 *
 * Returns { days, since, effectiveEnd } — days is 0 when it is not overdue.
 */
const MONTHS_LONG = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
]

/** "October 2026", for the head of a calendar. */
export const formatMonth = (iso) => {
  const d = parse(iso)
  return `${MONTHS_LONG[d.getUTCMonth()]} ${d.getUTCFullYear()}`
}

/** The first of the month a date falls in, and n months either side of it. */
export const addMonths = (iso, n) => {
  const d = parse(iso)
  const day = d.getUTCDate()
  d.setUTCDate(1)
  d.setUTCMonth(d.getUTCMonth() + n)
  // Clamp the day to the month's own length: a month after 31 Jan is 28 Feb,
  // not 3 March.
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate()
  d.setUTCDate(Math.min(day, last))
  return toISO(d)
}

/**
 * Six weeks of days for the month a date falls in, Monday first.
 *
 * Always six rows, so the calendar is the same height whichever month is on
 * screen — a grid that grows a row in March and loses it again in April makes
 * everything under it jump, and the thing under it is the rest of the card.
 *
 * Every cell is a real date, including the ones spilling in from the months
 * either side: they are drawn quieter but they are still days, and clicking
 * one is a perfectly reasonable way to mean the 30th of last month.
 */
export function monthGrid(iso) {
  const d = parse(iso)
  const first = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1))
  // getUTCDay() is Sunday-first; the week here starts on Monday.
  const lead = (first.getUTCDay() + 6) % 7
  const start = new Date(first)
  start.setUTCDate(1 - lead)
  const month = d.getUTCMonth()
  return Array.from({ length: 42 }, (_, i) => {
    const day = new Date(start)
    day.setUTCDate(start.getUTCDate() + i)
    return { iso: toISO(day), day: day.getUTCDate(), outside: day.getUTCMonth() !== month }
  })
}

export function overdue(block, today = todayISO()) {
  const late = block.state !== 'approved' && daysBetween(block.end_date, today) > 0
  return {
    days: late ? daysBetween(block.end_date, today) : 0,
    since: block.end_date,
    // While it runs late the block keeps pace with today, so its end dot walks
    // forward a day at a time instead of sitting in the past.
    effectiveEnd: late ? today : block.end_date
  }
}
