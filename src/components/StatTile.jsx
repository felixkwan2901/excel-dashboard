function formatValue(value) {
  if (typeof value !== 'number') return value
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`
  return value.toLocaleString()
}

export default function StatTile({ label, value, isCurrency, hint }) {
  return (
    <div className="stat-tile">
      <span className="stat-tile__label">{label}</span>
      <span className="stat-tile__value">
        {isCurrency ? formatValue(value) : value.toLocaleString()}
      </span>
      {hint && <span className="stat-tile__hint">{hint}</span>}
    </div>
  )
}
