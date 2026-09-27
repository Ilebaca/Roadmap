/**
 * Whose job a block is: ours or theirs.
 *
 * A roadmap stalls most often because both sides are waiting on each other, so
 * each block says which of them it is on. An admin flips it; a client reads it.
 * An approved block cannot be moved — the database refuses the write anyway,
 * so the control goes read-only rather than failing on click.
 */
const SIDES = [
  { value: 'studio', label: 'Studio' },
  { value: 'client', label: 'Client' }
]

export default function OwnerSwitch({ value = 'studio', editable, onChange }) {
  const current = SIDES.find((s) => s.value === value) ?? SIDES[0]

  if (!editable) {
    return (
      <span className={`owner-chip is-${current.value}`} title={`${current.label} does this`}>
        {current.label}
      </span>
    )
  }

  return (
    <div className="owner-switch" role="group" aria-label="Who does this">
      {SIDES.map((s) => (
        <button
          key={s.value}
          className={s.value === value ? 'is-on' : ''}
          aria-pressed={s.value === value}
          title={`${s.label} does this`}
          onClick={() => s.value !== value && onChange(s.value)}
        >
          {s.label}
        </button>
      ))}
    </div>
  )
}
