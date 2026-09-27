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

export const formatLong = (iso) => {
  const d = parse(iso)
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`
}

/** Compact range for the block's top-right corner: "23 Feb – 6 Mar 2026". */
export const formatRange = (a, b) => {
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
