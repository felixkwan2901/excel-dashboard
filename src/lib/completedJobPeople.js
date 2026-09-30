// Per-person maths for completed jobs, shared by the Completed jobs tab and the
// Dashboard chart so both show the same figures.

// Project GP/hr — what the Completed jobs page and Completed insights show for a
// job: the whole job's profit to date (the P&L's actual profit) ÷ actual hours. A
// charge-up job's profit to date is its total profit, so it equals its own GP/hr.
// The labour-only rate (job.gpPerHour on a quoted job = quoted − actual labour
// cost, ÷ actual hours) is never displayed; it only works out each person's GP
// below. Project GP/hr is what the pages show for a job.
export const projectProfit = (job) => (job.type === 'chargeup' ? job.profit : job.pl?.profitToDate ?? job.profit) ?? null
export const projectGpPerHour = (job) => (job.hours > 0 && projectProfit(job) != null ? projectProfit(job) / job.hours : null)

// Who did the job and who contributed: each person's hours, their share of the
// job's hours, and their GP on the job = the job's labour GP/hr × their hours — so
// the people on a job add back up to its labour profit. The rate itself stays in
// the background and is never displayed.
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
  const rate = job.hours > 0 ? job.profit / job.hours : null   // labour GP/hr (hidden)
  return {
    // part = the job's labour GP/hr × their hours (unrounded rate, so the parts add
    // back to the job's labour profit exactly).
    worked: worked.map((p) => ({ ...p, share: p.hours / total, part: rate == null ? 0 : rate * p.hours })),
    adjustments: all.filter((p) => p.hours <= 0),
  }
}

// A person's number across several jobs, weighted by their time: for each job,
// (their hours on it ÷ their hours on all the jobs) × their GP on that job, added
// up. E.g. 10 of 20.25 hours on one job = 49.4% of that job's GP. A person with a
// single job is 100% of it. entries = [{ hours, part }].
export function timeWeighted(entries) {
  const total = entries.reduce((t, e) => t + e.hours, 0)
  return total > 0 ? entries.reduce((t, e) => t + (e.hours / total) * e.part, 0) : null
}

// Each person's totals across the jobs shown: their hours and their part of each
// job (labour GP/hr × their hours), summed. Their GP/hr is total part ÷ total
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
  return [...people.values()].map((t) => {
    const hours = t.jobs.reduce((s, j) => s + j.hours, 0)
    return {
      ...t,
      hours: Math.round(t.hours * 100) / 100,
      count: t.jobs.length,
      gpPerHour: t.hours ? t.profit / t.hours : null,        // hidden; nothing displays it
      weightedGp: timeWeighted(t.jobs),                      // the person's number
      jobs: t.jobs.map((j) => ({ ...j, timeShare: hours ? j.hours / hours : 0 })).sort((a, b) => b.hours - a.hours),
    }
  })
}

// Per person, month by month. Each job carries the month it was completed in
// ("YYYY-MM"); every person gets their totals for each month and for all months
// together (Total = every month added up). A person is flagged when their number
// in the latest month is below the month before — only when they worked in both,
// since no work last month is not a drop.
export function personMonthly(jobs) {
  const months = [...new Set(jobs.map((j) => j.month).filter(Boolean))].sort()
  const byMonth = new Map(months.map((m) => [m, new Map(personTotals(jobs.filter((j) => j.month === m)).map((p) => [p.name, p]))]))
  const latest = months.at(-1), previous = months.at(-2)
  const people = personTotals(jobs).map((total) => {
    const monthly = Object.fromEntries(months.map((m) => [m, byMonth.get(m).get(total.name) ?? null]))
    const now = latest && monthly[latest], before = previous && monthly[previous]
    const flag = now && before && now.weightedGp !== null && before.weightedGp !== null && now.weightedGp < before.weightedGp
      ? { month: latest, previousMonth: previous, now: now.weightedGp, before: before.weightedGp }
      : null
    return { ...total, monthly, flag }
  })
  return { months, latest, previous, people }
}

export function monthName(ym, style = 'long') {
  return ym ? new Date(`${ym}-01T00:00:00Z`).toLocaleDateString('en-NZ', { month: style, year: 'numeric', timeZone: 'UTC' }) : ''
}
