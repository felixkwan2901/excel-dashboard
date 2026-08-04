export const CURRENCY = new Intl.NumberFormat('en-NZ', {
  style: 'currency',
  currency: 'NZD',
  maximumFractionDigits: 0,
})

export const PERCENT = new Intl.NumberFormat('en-NZ', {
  style: 'percent',
  maximumFractionDigits: 1,
})

// Claim/margin figures that should read as "done" often land at a small
// non-zero value (e.g. -$14, not exactly 0) that these formatters' own
// rounding (whole dollars, 0.1-point percent) collapses to zero — but the
// negative sign survives the rounding, producing a confusing "-$0"/"-0%".
// Clamp based on what the formatter will actually display, not an arbitrary
// epsilon, so any value that rounds to zero reads as a clean positive zero.
export function money(v) {
  if (v === null) return '—'
  return CURRENCY.format(Math.round(v) === 0 ? 0 : v)
}

export function percent(v) {
  if (v === null) return '—'
  return PERCENT.format(Math.round(v * 1000) === 0 ? 0 : v)
}
