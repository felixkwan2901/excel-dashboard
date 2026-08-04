export const CURRENCY = new Intl.NumberFormat('en-NZ', {
  style: 'currency',
  currency: 'NZD',
  maximumFractionDigits: 0,
})

export const PERCENT = new Intl.NumberFormat('en-NZ', {
  style: 'percent',
  maximumFractionDigits: 1,
})

// Claim/margin figures that should be ~0 sometimes land at e.g. -$0.01 from
// rounding during the claim process — clamp anything within a cent/0.1pt of
// zero so it reads as a clean "$0"/"0%" instead of a stray negative sign.
export function money(v) {
  if (v === null) return '—'
  return CURRENCY.format(Math.abs(v) < 0.01 ? 0 : v)
}

export function percent(v) {
  if (v === null) return '—'
  return PERCENT.format(Math.abs(v) < 0.001 ? 0 : v)
}
