// Axis maths, kept out of the components so the fiddly parts are in one place.

// A "nice" upper bound and evenly spaced ticks. Picking max = the largest
// value gives axes topping out at 376,981, which nobody reads; rounding up to
// the next 1/2/5 x 10^n gives 400,000 and four clean gridlines.
export function niceTicks(rawMax, targetCount = 4) {
  if (!Number.isFinite(rawMax) || rawMax <= 0) return { max: 1, ticks: [0, 1] }
  const roughStep = rawMax / targetCount
  const magnitude = 10 ** Math.floor(Math.log10(roughStep))
  const normalised = roughStep / magnitude
  const step = (normalised <= 1 ? 1 : normalised <= 2 ? 2 : normalised <= 5 ? 5 : 10) * magnitude
  const max = Math.ceil(rawMax / step) * step
  const ticks = []
  for (let t = 0; t <= max + step / 2; t += step) ticks.push(Number(t.toFixed(10)))
  return { max, ticks }
}

// Rounded top corners only. A plain rect with rx rounds the bottom too, which
// lifts the bar off its own baseline and reads as floating.
export function barPath(x, y, w, h, r = 4) {
  if (h <= 0) return ''
  const radius = Math.min(r, w / 2, h)
  return `M${x},${y + h} L${x},${y + radius} Q${x},${y} ${x + radius},${y} L${x + w - radius},${y} Q${x + w},${y} ${x + w},${y + radius} L${x + w},${y + h} Z`
}

// Same idea rotated: rounded right end, flat against the axis on the left.
export function hBarPath(x, y, w, h, r = 4) {
  if (w <= 0) return ''
  const radius = Math.min(r, h / 2, w)
  return `M${x},${y} L${x + w - radius},${y} Q${x + w},${y} ${x + w},${y + radius} L${x + w},${y + h - radius} Q${x + w},${y + h} ${x + w - radius},${y + h} L${x},${y + h} Z`
}

// $376,981 -> "$377k". Axis labels have to be scannable at a glance; the exact
// figure belongs in the tooltip and the table, not stacked up the side.
export function compactMoney(v) {
  const abs = Math.abs(v)
  const sign = v < 0 ? '-' : ''
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1)}m`
  if (abs >= 1000) return `${sign}$${Math.round(abs / 1000)}k`
  return `${sign}$${Math.round(abs)}`
}

export function compactHours(v) {
  const abs = Math.abs(v)
  const sign = v < 0 ? '-' : ''
  if (abs >= 1000) return `${sign}${(abs / 1000).toFixed(1)}k`
  return `${sign}${Math.round(abs)}`
}
