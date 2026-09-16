import { money, roundHours } from './format'

// The series behind the two charts that appear in more than one place.
//
// They were derived inside ChartsTab, which was fine while the Dashboard tab
// was the only thing drawing them. Now the Monthly claims and Upcoming work
// pages draw the same figures above their own tables, and two copies of this
// arithmetic is how a chart and the table beneath it start disagreeing about
// a month — which is exactly what the capacity chart's own footnote promises
// cannot happen. One definition, imported by both.

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const MONTH_FULL = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December']

const monthShort = (key) => {
  const [y, m] = key.split('-')
  return `${MONTH_LABELS[Number(m) - 1]} ${y.slice(2)}`
}

const monthLong = (key) => {
  const [y, m] = key.split('-')
  return `${MONTH_FULL[Number(m) - 1]} ${y}`
}

/** Claimed against costs, one entry per month that has been logged. */
export function claimsByMonthSeries(monthlyClaimsHistory) {
  return (monthlyClaimsHistory?.totalsByMonth ?? []).map((t) => ({
    label: monthShort(t.month),
    fullLabel: monthLong(t.month),
    values: [t.totalClaim, t.totalCosts],
    note:
      t.totalClaim - t.totalCosts < 0
        ? `${money(t.totalCosts - t.totalClaim)} more spent than claimed`
        : `${money(t.totalClaim - t.totalCosts)} ahead`,
  }))
}

// Planned hours summed from the per-job rows rather than read off the sheet's
// own Total Hours row. Those rows are typed, not formulas, and they lag: the
// sheet said 1316 hours for October while the jobs underneath added to 1718.
// Servicing plus everything booked against a job IS the total; the stored row
// is just the last time somebody recalculated it.
export function plannedByJobMonth(upcomingWork) {
  const totals = {}
  for (const m of MONTH_LABELS) {
    totals[m] = (upcomingWork?.jobs ?? []).reduce((sum, job) => {
      const v = job.months?.[m]
      return sum + (typeof v === 'number' ? v : 0)
    }, 0)
  }
  return totals
}

/** The above plus servicing, which together are the month's planned total. */
export function plannedHoursByMonth(upcomingWork) {
  const servicing = upcomingWork?.capacity?.servicingHours ?? {}
  const byJob = plannedByJobMonth(upcomingWork)
  const totals = {}
  for (const m of MONTH_LABELS) totals[m] = (servicing[m] ?? 0) + byJob[m]
  return totals
}

/** Planned hours against available hours, per month. */
export function capacityByMonthSeries(upcomingWork) {
  const capacity = upcomingWork?.capacity
  if (!capacity) return []
  const planned = plannedHoursByMonth(upcomingWork)
  return MONTH_LABELS.map((m) => {
    const p = planned[m]
    const available = capacity.hoursAvailable?.[m] ?? null
    const short = p !== null && available !== null && p > available
    return {
      label: m,
      fullLabel: m,
      values: [p, available],
      note: short
        ? `Short by ${roundHours(p - available)} hrs`
        : p !== null && available !== null
          ? `${roundHours(available - p)} hrs spare`
          : null,
    }
  }).filter((d) => d.values.some((v) => v !== null && v !== 0))
}

/** Planned minus available: above the line is short, below it is spare. */
export function balanceByMonthSeries(upcomingWork) {
  const capacity = upcomingWork?.capacity
  if (!capacity) return []
  const planned = plannedHoursByMonth(upcomingWork)
  return MONTH_LABELS.map((m) => {
    const available = capacity.hoursAvailable?.[m]
    const balance =
      available === null || available === undefined ? null : planned[m] - available
    return {
      label: m,
      fullLabel: m,
      values: [balance],
      note:
        balance === null
          ? null
          : balance > 0
            ? 'More work planned than crew to do it'
            : 'Room to take on more',
    }
  }).filter((d) => d.values[0] !== null)
}

export { MONTH_LABELS }
