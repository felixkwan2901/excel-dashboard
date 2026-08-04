export default function StatusBadge({ flagged }) {
  if (flagged) {
    return (
      <span className="badge badge--flagged">
        <span className="badge__icon" aria-hidden="true">
          !
        </span>
        Flagged
      </span>
    )
  }

  return (
    <span className="badge badge--passed">
      <span className="badge__icon" aria-hidden="true">
        ✓
      </span>
      OK
    </span>
  )
}
