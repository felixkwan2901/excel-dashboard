import { useEffect, useMemo, useState } from 'react'
import { cents, money, percent, roundHours } from '../lib/format'
import ChartCard from './charts/ChartCard'
import BarChart from './charts/BarChart'
import HBarChart from './charts/HBarChart'
import { compactMoney } from './charts/chartScale'
import { ACTUAL, BAD, COMPARE, GOOD } from './charts/colors'
import { monthName, projectGpPerHour, projectProfit } from '../lib/completedJobPeople'
import { jobsToReview } from '../lib/completedJobReview'
import { fetchJobCategories } from '../lib/jobCategoryStore'
import { JOB_CATEGORIES } from '../lib/jobCategories'
import { word } from '../lib/words'

// The Dashboard: four headline figures and three charts, full width, big
// enough to read from across a desk. Deliberately few — the owner's verdict
// on a six-chart grid was "too much and hard to see". Nothing here restates
// a table that exists elsewhere (people are on Employee KPI, capacity on
// Upcoming work).
//
// Colours follow charts/colors.js: blue is what happened, orange is what it
// is compared with, red/green only on a figure or a dot.

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const monthShort = (key) => { const [y, m] = key.split('-'); return `${MONTH_LABELS[Number(m) - 1]} ${y.slice(2)}` }
const NOT_SET = 'Not set'
// This month, NZ time, as 'YYYY-MM' — the month that is still being claimed.
const currentMonth = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Pacific/Auckland', year: 'numeric', month: '2-digit' }).format(new Date()).slice(0, 7)
const SELECT = 'rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1.5 text-[13px] font-medium text-white'

// A BI-style tile: label, one big figure, one line under it.
function Kpi({ label, value, sub, tone }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-[14px] border border-white/[0.06] bg-[#11161c] px-4 py-3">
      <span className="truncate text-[11px] font-medium uppercase tracking-wide text-neutral-500">{label}</span>
      <span className="text-[22px] font-semibold tabular-nums leading-tight text-white" style={tone ? { color: tone } : undefined}>{value}</span>
      {sub && <span className="truncate text-[12px] tabular-nums text-neutral-500">{sub}</span>}
    </div>
  )
}

// Profit ÷ hours over a set of completed jobs, weighted by hours.
const rate = (jobs) => {
  const w = jobs.filter((j) => projectGpPerHour(j) !== null)
  const h = w.reduce((t, j) => t + j.hours, 0)
  return h ? w.reduce((t, j) => t + projectProfit(j), 0) / h : null
}
export default function ChartsTab({ jobs, monthlyClaimsHistory, completedJobs = [], onBack }) {
  // ---- filters: the completed-jobs month and the type of work
  const months = useMemo(() => [...new Set(completedJobs.map((j) => j.month).filter(Boolean))].sort().reverse(), [completedJobs])
  const [month, setMonth] = useState(() => months[0] ?? 'all')
  const [work, setWork] = useState('all')
  const [categories, setCategories] = useState(null)
  useEffect(() => {
    let live = true
    fetchJobCategories().then((c) => { if (live) setCategories(c ?? {}) }).catch(() => { if (live) setCategories({}) })
    return () => { live = false }
  }, [])
  const catOf = (j) => categories?.[j.jobNumber] || NOT_SET
  const completed = useMemo(() => completedJobs
    .filter((j) => month === 'all' || j.month === month)
    .filter((j) => work === 'all' || catOf(j) === work), [completedJobs, month, work, categories]) // eslint-disable-line react-hooks/exhaustive-deps
  const workOptions = useMemo(() => [...JOB_CATEGORIES, NOT_SET].filter((c) => completedJobs.some((j) => catOf(j) === c) || jobs.some((j) => ((j.jobCategory || '').trim() || NOT_SET) === c)), [completedJobs, jobs, categories]) // eslint-disable-line react-hooks/exhaustive-deps

  // ---- headline figures
  const byMonth = monthlyClaimsHistory?.totalsByMonth ?? []
  // The headline figures and the margin line use the last COMPLETE month. On
  // the 1st, "this month" is three claims against a month of costs and reads
  // like a collapse; the bar chart still shows the month so far, labelled.
  const now = currentMonth()
  const settled = byMonth.filter((t) => t.month !== now)
  const last = settled.at(-1), prev = settled.at(-2)
  const marginOf = (t) => (t && t.totalClaim ? (t.totalClaim - t.totalCosts) / t.totalClaim : null)
  const over = jobsToReview(completed)
  const quotedDone = completed.filter((j) => j.type === 'quoted')

  // ---- 1. claimed vs costs by month
  const moneyByMonth = useMemo(() => byMonth.map((t) => ({
    label: monthShort(t.month), fullLabel: monthName(t.month), values: [t.totalClaim, t.totalCosts],
    note: (t.month === now ? 'So far this month · ' : '') + (t.totalClaim - t.totalCosts < 0 ? `${money(t.totalCosts - t.totalClaim)} more spent than claimed` : `${money(t.totalClaim - t.totalCosts)} ahead`),
  })), [byMonth, now])

  // ---- 3. completed jobs: profit per hour by type of work
  const overall = rate(completed)
  const profitByType = useMemo(() => {
    const groups = new Map()
    for (const j of completed) { const c = catOf(j); if (!groups.has(c)) groups.set(c, []); groups.get(c).push(j) }
    return [...groups].map(([label, list]) => ({ label, fullLabel: label, jobs: list.length, hours: roundHours(list.reduce((t, j) => t + (j.hours ?? 0), 0)), gp: rate(list) }))
      .filter((r) => r.gp !== null)
      .map((r) => ({ ...r, values: [r.gp], tones: [r.gp < 0 ? 'bad' : overall != null && r.gp >= overall ? 'good' : null] }))
      .sort((a, b) => b.gp - a.gp)
  }, [completed, categories, overall]) // eslint-disable-line react-hooks/exhaustive-deps

  // ---- 4. quoted jobs: hours worked against the quote
  const hoursVsQuote = useMemo(() => quotedDone
    .filter((j) => j.quotedHours > 0)
    .map((j) => ({ label: `${j.jobNumber} ${j.jobName}`, fullLabel: `${j.jobNumber} ${j.jobName}`, jobNumber: j.jobNumber,
      values: [j.hours, j.quotedHours], tones: [j.hours > j.quotedHours + 0.005 ? 'bad' : null],
      ratio: j.hours / j.quotedHours, note: j.hours > j.quotedHours ? `${roundHours(j.hours - j.quotedHours)} h over the quote` : `${roundHours(j.quotedHours - j.hours)} h under` }))
    .sort((a, b) => b.ratio - a.ratio).slice(0, 12), [quotedDone])

  const monthLabel = month === 'all' ? 'all months' : monthName(month)

  return (
    <div className="mx-auto flex w-full max-w-[1800px] flex-col gap-5">
      <nav className="flex items-center gap-1.5 text-sm text-text-muted">
        <button className="transition-colors hover:text-text-primary" onClick={onBack}>Operations overview</button>
        <span aria-hidden="true">/</span>
        <span className="text-text-primary">Dashboard</span>
      </nav>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-white">Dashboard</h1>
          <p className="mt-1 text-sm text-neutral-400">The month in money, and what the finished jobs paid per hour. Hover a bar for the exact figure.</p>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2 text-[12px] text-neutral-500">
            Completed in
            <select value={month} onChange={(e) => setMonth(e.target.value)} className={SELECT}>
              {months.map((m) => <option key={m} value={m}>{monthName(m)}</option>)}
              <option value="all">All months</option>
            </select>
          </label>
          <label className="flex items-center gap-2 text-[12px] text-neutral-500">
            {word('typeOfWork')}
            <select value={work} onChange={(e) => setWork(e.target.value)} className={SELECT}>
              <option value="all">All</option>
              {workOptions.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
        </div>
      </div>

      {/* headline figures */}
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Kpi label={last ? `Claimed · ${monthShort(last.month)}` : 'Claimed'} value={last ? money(last.totalClaim) : '—'} sub={prev ? `${monthShort(prev.month)}: ${money(prev.totalClaim)}` : undefined} />
        <Kpi label={last ? `Costs · ${monthShort(last.month)}` : 'Costs'} value={last ? money(last.totalCosts) : '—'} sub={prev ? `${monthShort(prev.month)}: ${money(prev.totalCosts)}` : undefined} />
        <Kpi label={last ? `Margin · ${monthShort(last.month)}` : 'Margin'} value={marginOf(last) == null ? '—' : percent(marginOf(last))} tone={marginOf(last) == null ? undefined : marginOf(last) < 0 ? BAD : GOOD}
          sub={marginOf(prev) == null ? undefined : `${monthShort(prev.month)}: ${percent(marginOf(prev))}`} />
        <Kpi label={`${word('profitPerHour')} · completed jobs`} value={overall == null ? '—' : `${cents(overall)}/hr`} sub={`${completed.length} job${completed.length === 1 ? '' : 's'} · ${monthLabel}${over.length ? ` · ${over.length} over quote` : ''}`} />
      </div>

      <div className="flex flex-col gap-5">

        <ChartCard title="Claimed against costs, by month"           series={[{ name: 'Claimed', color: ACTUAL }, { name: 'Costs', color: COMPARE }]}
          footnote={byMonth.length ? `${byMonth.length} month${byMonth.length === 1 ? '' : 's'} logged${byMonth.some((t) => t.month === now) ? `, the last one still being claimed` : ''}. A month where the orange bar is taller cost more than it billed.` : undefined}
          table={<table><caption>Claimed and costs by month</caption><tbody>{moneyByMonth.map((d) => <tr key={d.label}><th scope="row">{d.fullLabel}</th><td>Claimed {money(d.values[0])}</td><td>Costs {money(d.values[1])}</td></tr>)}</tbody></table>}>
          <BarChart data={moneyByMonth} height={300} series={[{ name: 'Claimed', color: ACTUAL }, { name: 'Costs', color: COMPARE }]} valueFormat={money} axisFormat={compactMoney} emptyMessage="No month-by-month claims logged yet." />
        </ChartCard>


        <ChartCard title={`${word('profitPerHour')} by type of work — completed jobs`}           footnote={`${monthLabel}${work === 'all' ? '' : ` · ${work}`}. Profit ÷ hours worked, weighted by hours. Green is at or above the overall ${overall == null ? '' : cents(overall) + '/hr'}; red lost money. Type of work is set on Completed jobs.`}
          table={<table><caption>Profit per hour by type of work, completed jobs</caption><tbody>{profitByType.map((r) => <tr key={r.label}><th scope="row">{r.label}</th><td>{r.jobs} job{r.jobs === 1 ? '' : 's'}</td><td>{r.hours} h</td><td>{cents(r.gp)}/hr</td></tr>)}</tbody></table>}>
          <HBarChart rows={profitByType} series={[{ name: word('profitPerHour'), color: ACTUAL }]} labelWidth={170} valueFormat={(v) => `${cents(v)}/hr`} axisFormat={compactMoney} emptyMessage="No completed jobs for this month and type of work." />
        </ChartCard>

        <ChartCard title="Hours worked against the quote — quoted jobs"           series={[{ name: 'Hours worked', color: ACTUAL }, { name: 'Quoted hours', color: COMPARE }]}
          footnote={`${monthLabel}. The jobs furthest over their quote first; a red figure is over. Up to twelve shown — the rest are on Completed jobs.`}
          table={<table><caption>Hours worked against quoted hours</caption><tbody>{hoursVsQuote.map((r) => <tr key={r.label}><th scope="row">{r.label}</th><td>Worked {roundHours(r.values[0])} h</td><td>Quoted {roundHours(r.values[1])} h</td><td>{r.note}</td></tr>)}</tbody></table>}>
          <HBarChart rows={hoursVsQuote} series={[{ name: 'Hours worked', color: ACTUAL }, { name: 'Quoted hours', color: COMPARE }]} labelWidth={190} valueFormat={(v) => `${roundHours(v)} h`} axisFormat={(v) => `${roundHours(v)}h`} emptyMessage="No quoted jobs with a quoted hours figure for this month." />
        </ChartCard>


      </div>
    </div>
  )
}
