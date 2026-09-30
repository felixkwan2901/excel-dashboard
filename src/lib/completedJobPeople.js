// Per-person maths for completed jobs, shared by the Completed jobs tab and the
// Dashboard chart so both show the same figures.

// Project GP/hr — what the Completed jobs page and Completed insights show for a
// job: the whole job's profit to date (the P&L's actual profit) ÷ actual hours. A
// charge-up job's profit to date is its total profit, so it equals its own GP/hr.
// A person's part of a job is this rate × their hours. The labour-only rate
// (job.gpPerHour on a quoted job) is not shown or used for people.
export const projectProfit = (job) => (job.type === 'chargeup' ? job.profit : job.pl?.profitToDate ?? job.profit) ?? null
export const projectGpPerHour = (job) => (job.hours > 0 && projectProfit(job) != null ? projectProfit(job) / job.hours : null)

// Who did the job and who contributed: each person's hours, their share of the
// job's hours, and their PART of the job = the job's project GP/hr × their hours —
// so the people on a job add back up to the job's profit to date. (The labour-only
// rate is not used for people any more, and is shown nowhere.)
//
// Katipolt lists a person's after-hours or overtime rate as its own line ("Sean
// Baines After Hours", "Sean Baines Overtime") and corrections as negative lines, so lines are merged per person and
// netted first. Anyone left at zero or below was an adjustment, not a
// contribution: they're listed separately and left out of the split, so the
// shares still add to 100% and the whole profit is allocated.
const EXTRA_RATE = /\s+(after\s*hours|overtime)$/i

export function contributors(job) {
  const people = new Map()
  for (const w of job.workers ?? []) {
    const afterHours = EXTRA_RATE.test(w.name)
    const name = w.name.replace(EXTRA_RATE, '').trim()
    const p = people.get(name) ?? { name, hours: 0, afterHours: false }
    p.hours += w.hours
    p.afterHours ||= afterHours
    people.set(name, p)
  }
  const all = [...people.values()].map((p) => ({ ...p, hours: Math.round(p.hours * 100) / 100 }))
  const worked = all.filter((p) => p.hours > 0).sort((a, b) => b.hours - a.hours)
  const total = worked.reduce((sum, p) => sum + p.hours, 0)
  const rate = projectGpPerHour(job)
  return {
    // part = the job's project GP/hr × their hours (unrounded rate, so the parts
    // add back to the job's profit to date exactly).
    worked: worked.map((p) => ({ ...p, share: p.hours / total, part: rate == null ? 0 : rate * p.hours })),
    adjustments: all.filter((p) => p.hours <= 0),
  }
}

// Each person's totals across the jobs shown: their hours and their part of each
// job (its project GP/hr × their hours), summed. Their GP/hr is total part ÷ total
// hours — so a person is weighted by the time they put in.
// Quoted jobs only — a charge-up job's profit isn't split per person.
export function personTotals(jobs) {
  const people = new Map()
  for (const job of jobs.filter((j) => j.type === 'quoted')) {
    for (const p of contributors(job).worked) {
      const t = people.get(p.name) ?? { name: p.name, hours: 0, profit: 0, jobs: [] }
      t.hours += p.hours
      t.profit += p.part
      t.jobs.push({ job, hours: p.hours, part: p.part })
      people.set(p.name, t)
    }
  }
  return [...people.values()].map((t) => ({
    ...t,
    hours: Math.round(t.hours * 100) / 100,
    count: t.jobs.length,
    gpPerHour: t.hours ? t.profit / t.hours : null,
    jobs: t.jobs.sort((a, b) => b.hours - a.hours),
  }))
}

// Per person, month by month. Each job carries the month it was completed in
// ("YYYY-MM"); every person gets their totals for each month and for all months
// together (Total = every month added up). A person is flagged when their GP/hr
// in the latest month is below their GP/hr the month before — only when they
// worked in both, since no work last month is not a drop.
export function personMonthly(jobs) {
  const months = [...new Set(jobs.map((j) => j.month).filter(Boolean))].sort()
  const byMonth = new Map(months.map((m) => [m, new Map(personTotals(jobs.filter((j) => j.month === m)).map((p) => [p.name, p]))]))
  const latest = months.at(-1), previous = months.at(-2)
  const people = personTotals(jobs).map((total) => {
    const monthly = Object.fromEntries(months.map((m) => [m, byMonth.get(m).get(total.name) ?? null]))
    const now = latest && monthly[latest], before = previous && monthly[previous]
    const flag = now && before && now.gpPerHour !== null && before.gpPerHour !== null && now.gpPerHour < before.gpPerHour
      ? { month: latest, previousMonth: previous, now: now.gpPerHour, before: before.gpPerHour }
      : null
    return { ...total, monthly, flag }
  })
  return { months, latest, previous, people }
}

export function monthName(ym, style = 'long') {
  return ym ? new Date(`${ym}-01T00:00:00Z`).toLocaleDateString('en-NZ', { month: style, year: 'numeric', timeZone: 'UTC' }) : ''
}
