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

export const formatStamp = (ts) => {
  const d = new Date(ts)
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`
}

export const todayISO = () => toISO(new Date())
