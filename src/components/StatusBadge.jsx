const STATUS_MAP = {
  Passed: 'good',
  Approved: 'good',
  Flagged: 'critical',
  Pending: 'warning',
}

const ICONS = {
  good: '✓',
  warning: '●',
  critical: '!',
}

export default function StatusBadge({ label }) {
  const displayLabel = label || 'Not checked yet'
  const tone = STATUS_MAP[label] ?? 'warning'
  return (
    <span className={`badge badge--${tone}`}>
      <span className="badge__icon" aria-hidden="true">
        {ICONS[tone]}
      </span>
      {displayLabel}
    </span>
  )
}
