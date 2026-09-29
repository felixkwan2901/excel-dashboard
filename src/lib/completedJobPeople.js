// Per-person maths for completed jobs, shared by the Completed jobs tab and the
// Dashboard chart so both show the same figures.

// Who did the job and who contributed: each person's hours, their share of the
// job's hours, and the job's GP/hr × their hours — so the people on a job add back
// up to the job's labour profit.
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
  return {
    // gpTimesHours = the job's GP/hr × their hours (adds up to its labour profit).
    // (unrounded rate, so the parts add back to the job's labour profit exactly)
    worked: worked.map((p) => ({ ...p, share: p.hours / total, gpTimesHours: (job.profit / job.hours) * p.hours })),
    adjustments: all.filter((p) => p.hours <= 0),
  }
}

// Each person's totals across the jobs shown: their hours and their part of each
// job's labour profit (that job's GP/hr × their hours), summed. Their GP/hr is
// total part ÷ total hours — so a person is weighted by the time they put in.
// Quoted jobs only — a charge-up job's profit isn't split per person.
export function personTotals(jobs) {
  const people = new Map()
  for (const job of jobs.filter((j) => j.type === 'quoted')) {
    for (const p of contributors(job).worked) {
      const t = people.get(p.name) ?? { name: p.name, hours: 0, profit: 0, jobs: [] }
      t.hours += p.hours
      t.profit += p.gpTimesHours
      t.jobs.push({ job, hours: p.hours, part: p.gpTimesHours })
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
