import { useState } from 'react'
import { useStore } from '../state/store'
import { formatRange, formatStamp } from '../lib/dates'

const STATES = {
  todo: 'To do',
  in_progress: 'In progress',
  on_hold: 'On hold',
  review: 'Review',
  approved: 'Approved'
}

/**
 * One line of the log, in words.
 *
 * Written as a sentence rather than a table of fields: "Milan moved it to
 * Review" is read at a glance, and a row of from/to columns is not. The actor
 * is whatever address was on the account at the time, which is what the row
 * carries.
 */
function sentence(e) {
  const d = e.detail ?? {}
  switch (e.kind) {
    case 'created':
      return 'added this block'
    case 'state':
      return `moved it to ${STATES[d.to] ?? d.to}`
    case 'owner':
      return d.to === 'client' ? 'handed it to the client' : 'took it back to the studio'
    case 'dates':
      return `set the dates to ${formatRange(d.to?.start, d.to?.end)}`
    case 'renamed':
      return `renamed it to “${d.to}”`
    case 'approved':
      return 'approved it'
    case 'unapproved':
      return 'reopened it'
    default:
      return e.kind
  }
}

/**
 * What happened to a block, from the day it was made.
 *
 * Shut by default and read only when it is opened: nobody looks at this until
 * they have a question about it, and loading every line of every block to
 * show none of them is a round trip spent on nothing.
 *
 * It is the quietest thing on the card on purpose. The card is about the work;
 * this is about the paperwork, and it only matters when somebody asks who
 * moved what and when.
 */
export default function BlockHistory({ blockId }) {
  const { actions } = useStore()
  const [open, setOpen] = useState(false)
  const [rows, setRows] = useState(null)

  const toggle = async () => {
    const next = !open
    setOpen(next)
    if (!next || rows) return
    try {
      setRows(await actions.blockHistory(blockId))
    } catch {
      setRows([]) // nothing to show beats a card that falls over
    }
  }

  return (
    <div className="history">
      <button className="history-toggle" onClick={toggle} aria-expanded={open}>
        {open ? 'Hide history' : 'View history'}
      </button>

      {open && (
        <ol className="history-list">
          {rows === null && <li className="history-empty">Reading…</li>}
          {rows?.length === 0 && (
            <li className="history-empty">Nothing recorded yet. Changes from here on are.</li>
          )}
          {rows?.map((e) => (
            <li key={e.id}>
              <span className="history-who">{e.actor_email || 'Someone'}</span>{' '}
              {sentence(e)}
              <span className="history-when">{formatStamp(e.created_at)}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}
