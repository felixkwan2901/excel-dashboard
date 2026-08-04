const STATUS_TONE = {
  Approved: 'approved',
  Passed: 'passed',
  Pending: 'pending',
  Flagged: 'flagged',
}

const TONE_ICON = {
  approved: '✓',
  passed: '✓',
  pending: '●',
  flagged: '!',
}

export default function StatusBadge({ label }) {
  if (!label) {
    return <span className="badge-empty">—</span>
  }

  const tone = STATUS_TONE[label] ?? 'passed'
  return (
    <span className={`badge badge--${tone}`}>
      <span className="badge__icon" aria-hidden="true">
        {TONE_ICON[tone]}
      </span>
      {label}
    </span>
  )
}
