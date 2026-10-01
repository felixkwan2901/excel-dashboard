// What each colour means, on every chart and table — one rule, written once.
//
//   ACTUAL   blue    what happened: actual cost, hours worked, profit/hr, claimed
//   COMPARE  orange  what it is measured against: the quote, the plan, the costs
//   BAD      red     over quote or below zero — only ever on a figure or a marker
//                    beside its number, never a bar next to an orange one (red
//                    and orange are too close to tell apart)
//   GOOD     green   at or above the target — likewise, on figures only
//
// The tokens are defined per theme in index.css (--viz-1, --viz-2, …) so light
// and dark each get a step that passes on their own surface.
export const ACTUAL = 'var(--viz-1)'
export const COMPARE = 'var(--viz-2)'
export const BAD = 'var(--viz-critical)'
export const GOOD = 'var(--brand-green)'

export const COLOUR_KEY = [
  { color: ACTUAL, label: 'what happened' },
  { color: COMPARE, label: 'what it’s compared with — the quote, the plan, the costs' },
  { color: BAD, label: 'over, or below zero', text: true },
  { color: GOOD, label: 'at or above target', text: true },
]
