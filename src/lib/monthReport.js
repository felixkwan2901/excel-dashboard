// The month report: the numbers for one month of completed jobs, in one
// place, for the printable page and the Excel download. Everything here is
// the same maths the pages use (completedJobPeople.js, completedJobReview.js).
import { monthName, personMonthly, projectGpPerHour, projectProfit } from './completedJobPeople'
import { jobsToReview } from './completedJobReview'
import { JOB_CATEGORIES } from './jobCategories'
import { word } from './words'

const NOT_SET = 'Not set'
export const TYPE_LABEL = { quoted: 'Quoted', chargeup: 'Charge-up' }
const r2 = (v) => (v == null ? null : Math.round(v * 100) / 100)

// Profit ÷ hours over a set of jobs, weighted by hours; jobs with no hours left out.
export function rate(jobs) {
  const with_ = jobs.filter((j) => projectGpPerHour(j) !== null)
  const h = with_.reduce((t, j) => t + j.hours, 0)
  return h ? with_.reduce((t, j) => t + projectProfit(j), 0) / h : null
}
const stats = (jobs) => ({ count: jobs.length, profit: jobs.reduce((t, j) => t + (projectProfit(j) ?? 0), 0), hours: r2(jobs.reduce((t, j) => t + (j.hours ?? 0), 0)), gp: rate(jobs) })

// Jobs with no profit per hour (no hours worked) are left out of the whole
// report; only their count is kept, so the page can say how many.
export function buildMonthReport(allCompletedJobs, categories, month) {
  const noHours = allCompletedJobs.filter((j) => j.month === month && projectGpPerHour(j) === null).length
  const completedJobs = allCompletedJobs.filter((j) => projectGpPerHour(j) !== null)
  const jobs = completedJobs.filter((j) => j.month === month)
  const cu = jobs.filter((j) => j.type === 'chargeup'), q = jobs.filter((j) => j.type === 'quoted')
  const months = [...new Set(completedJobs.map((j) => j.month).filter(Boolean))].sort()
  const previousMonth = months[months.indexOf(month) - 1]
  const previous = previousMonth ? stats(completedJobs.filter((j) => j.month === previousMonth)) : null
  const byCat = new Map()
  for (const j of jobs) { const c = categories?.[j.jobNumber] || NOT_SET; if (!byCat.has(c)) byCat.set(c, []); byCat.get(c).push(j) }
  const byType = [...JOB_CATEGORIES, NOT_SET].filter((c) => byCat.has(c)).map((c) => {
    const list = byCat.get(c), lcu = list.filter((j) => j.type === 'chargeup'), lq = list.filter((j) => j.type === 'quoted')
    return { cat: c, n: list.length, cuN: lcu.length, cuGp: rate(lcu), qN: lq.length, qGp: rate(lq), gp: rate(list), profit: list.reduce((t, j) => t + (projectProfit(j) ?? 0), 0) }
  })
  const pm = personMonthly(completedJobs.filter((j) => j.type === 'quoted'))
  const people = pm.people
    .map((p) => ({ name: p.name, month: p.monthly[month] ?? null, total: { hours: p.hours, count: p.count, weightedGp: p.weightedGp }, flag: p.flag && p.flag.month === month ? p.flag : null }))
    .filter((p) => p.month)
    .sort((a, b) => (b.month.weightedGp ?? -Infinity) - (a.month.weightedGp ?? -Infinity))
  const ranked = jobs.filter((j) => projectGpPerHour(j) !== null).sort((a, b) => projectGpPerHour(b) - projectGpPerHour(a))
  return {
    month, monthLabel: monthName(month), previousMonth, previous,
    jobs, all: stats(jobs), chargeup: stats(cu), quoted: stats(q),
    byType, overQuote: jobsToReview(jobs), people, peopleMonths: pm.months,
    best: ranked.slice(0, 5), worst: ranked.slice(-5).reverse(),
    untyped: jobs.filter((j) => !categories?.[j.jobNumber]).length,
    noHours,
    categories: categories ?? {},
  }
}

// The Excel download: Completed jobs, By person, By type of work, Summary.
export async function downloadMonthReportExcel(report) {
  const XLSX = await import('xlsx')
  const wb = XLSX.utils.book_new()
  const jobsRows = report.jobs.map((j) => ({
    [word('jobNumber')]: j.jobNumber, [word('jobName')]: j.jobName, [word('jobType')]: TYPE_LABEL[j.type] ?? j.type,
    [word('typeOfWork')]: report.categories[j.jobNumber] ?? '',
    [word('profitPerHour')]: r2(projectGpPerHour(j)), [word('quotedHours')]: j.quotedHours ?? null, [word('hoursWorked')]: j.hours,
    [word('hoursVsQuote')]: j.quotedHours == null ? null : r2(j.quotedHours - j.hours),
    [word('quotedProfit')]: j.pl?.quotedProfit ?? null, [word('quotedMargin')]: j.pl?.quotedMargin ?? null,
    [word('profit')]: projectProfit(j), [word('margin')]: j.pl?.marginToDate ?? null,
    'Labour cost quoted': j.labour?.quotedCost ?? null, 'Labour cost actual': j.labour?.actualCost ?? null,
    'Total cost quoted': j.pl?.quotedCost ?? null, 'Total cost actual': j.pl?.actualCost ?? null,
    'Worked by': (j.workers ?? []).map((w) => `${w.name} ${w.hours} h`).join('; '),
    'Over quote': jobsToReview([j])[0]?.over.map((o) => o.label).join(', ') ?? '',
  }))
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(jobsRows), 'Completed jobs')
  const peopleRows = report.people.map((p) => ({
    Person: p.name, Month: report.monthLabel, Jobs: p.month.count, Hours: p.month.hours, [word('theirProfit')]: r2(p.month.weightedGp),
    'Jobs (all months)': p.total.count, 'Hours (all months)': p.total.hours, [`${word('theirProfit')} (all months)`]: r2(p.total.weightedGp),
    'Down on last month': p.flag ? 'yes' : '',
  }))
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(peopleRows), 'By person')
  const typeRows = report.byType.map((r) => ({
    [word('typeOfWork')]: r.cat, Jobs: r.n, 'Charge-up jobs': r.cuN, [`Charge-up ${word('profitPerHour')}`]: r2(r.cuGp),
    'Quoted jobs': r.qN, [`Quoted ${word('profitPerHour')}`]: r2(r.qGp), [word('profitPerHour')]: r2(r.gp), [word('profit')]: r2(r.profit),
  }))
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(typeRows), 'By type of work')
  const s = report
  const summary = [
    ['Month', s.monthLabel], ['Completed jobs', s.all.count], ['Charge-up', s.chargeup.count], ['Quoted', s.quoted.count],
    [word('profit'), r2(s.all.profit)], [word('hoursWorked'), s.all.hours], [word('profitPerHour'), r2(s.all.gp)],
    [`Charge-up ${word('profitPerHour')}`, r2(s.chargeup.gp)], [`Quoted ${word('profitPerHour')}`, r2(s.quoted.gp)],
    ['Over quote', s.overQuote.length], ['No type of work', s.untyped], ['Left out (no profit/hr)', s.noHours],
    ...(s.previous ? [[`${monthName(s.previousMonth)} ${word('profitPerHour')}`, r2(s.previous.gp)]] : []),
  ]
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summary), 'Summary')
  XLSX.writeFile(wb, `month-report-${s.month}.xlsx`)
}
