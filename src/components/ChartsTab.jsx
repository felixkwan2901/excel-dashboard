import { useEffect, useMemo, useState } from 'react'
import { cents, money, percent, roundHours } from '../lib/format'
import ChartCard from './charts/ChartCard'
import BarChart from './charts/BarChart'
import HBarChart from './charts/HBarChart'
import LineChart from './charts/LineChart'
import ScatterChart from './charts/ScatterChart'
import { compactMoney } from './charts/chartScale'
import { ACTUAL, BAD, COMPARE, GOOD } from './charts/colors'
import { ColourKey } from './charts/ColourKey'
import { monthName, projectGpPerHour, projectProfit } from '../lib/completedJobPeople'
import { jobsToReview } from '../lib/completedJobReview'
import { fetchJobCategories } from '../lib/jobCategoryStore'
import { JOB_CATEGORIES } from '../lib/jobCategories'
import { word } from '../lib/words'

// The Dashboard, laid out the way a BI dashboard is: filters in one row, a
// strip of headline figures, then a grid of charts that each answer ONE
// question. Nothing here restates a table that exists elsewhere — the
// by-person figures live on Completed insights, planned hours against
// capacity on Upcoming work — so every chart is a comparison or a trend a
// table can't give at a glance.
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
// A mean weighted by hours, not a mean of means, for the active-job figures.
const weightedRate = (list, rateField, hoursField) => {
  let hours = 0, value = 0
  for (const job of list) {
    const h = typeof job[hoursField] === 'number' ? job[hoursField] : 0
    const r = typeof job[rateField] === 'number' ? job[rateField] : null
    if (!h || r === null) continue
    hours += h; value += r * h
  }
  return hours ? value / hours : null
}

export default function ChartsTab({ jobs, monthlyClaimsHistory, completedJobs = [], fieldProgress, onSelectJob, onBack }) {
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
  const active = useMemo(() => jobs.filter((j) => work === 'all' || ((j.jobCategory || '').trim() || NOT_SET) === work), [jobs, work])
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
  const siteRows = active.map((j) => fieldProgress?.get(String(j.jobNumber))).filter((f) => f && f.state !== 'no-data')
  const siteAvg = siteRows.length ? siteRows.reduce((t, f) => t + (f.percent ?? 0), 0) / siteRows.length : null
  const onSiteNow = [...new Set(siteRows.flatMap((f) => f.onSite))]

  // ---- 1. claimed vs costs by month
  const moneyByMonth = useMemo(() => byMonth.map((t) => ({
    label: monthShort(t.month), fullLabel: monthName(t.month), values: [t.totalClaim, t.totalCosts],
    note: (t.month === now ? 'So far this month · ' : '') + (t.totalClaim - t.totalCosts < 0 ? `${money(t.totalCosts - t.totalClaim)} more spent than claimed` : `${money(t.totalClaim - t.totalCosts)} ahead`),
  })), [byMonth, now])

  // ---- 2. margin by month
  const marginByMonth = useMemo(() => settled.map((t) => ({ label: monthShort(t.month), fullLabel: monthName(t.month), values: [marginOf(t)] })), [byMonth, now]) // eslint-disable-line react-hooks/exhaustive-deps

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

  // ---- 5. built against claimed, per active job (field app × claims)
  const builtVsClaimed = useMemo(() => active
    .map((j) => {
      const f = fieldProgress?.get(String(j.jobNumber))
      if (!f || f.state === 'no-data' || !(j.quotedPrice > 0) || typeof j.claimToDate !== 'number') return null
      const claimed = (j.claimToDate / j.quotedPrice) * 100
      return { label: `${j.jobNumber} ${j.jobName}`, jobNumber: j.jobNumber, x: f.percent ?? 0, y: Math.round(claimed), gap: Math.round(claimed) - (f.percent ?? 0) }
    })
    .filter(Boolean), [active, fieldProgress])

  // ---- 6. active jobs: quoted vs actual profit per hour by type of work
  const quoteAccuracy = useMemo(() => {
    const groups = new Map()
    for (const j of active) { const c = (j.jobCategory || '').trim() || NOT_SET; if (!groups.has(c)) groups.set(c, []); groups.get(c).push(j) }
    return [...groups].map(([label, list]) => ({ label, fullLabel: label, jobs: list.length,
      values: [weightedRate(list, 'gpPerHour', 'actualLabourHours'), weightedRate(list, 'quotedGpPerHour', 'quotedLabourHours')] }))
      .filter((r) => r.values.some((v) => v !== null))
      .map((r) => ({ ...r, values: r.values.map((v) => v ?? 0), tones: [r.values[1] != null && r.values[0] != null && r.values[0] < r.values[1] * 0.85 ? 'bad' : null, null] }))
      .sort((a, b) => b.values[1] - a.values[1])
  }, [active])

  const openJob = (jobNumber) => { const job = jobs.find((j) => j.jobNumber === jobNumber); if (job && onSelectJob) onSelectJob(job) }
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
          <p className="mt-1 text-sm text-neutral-400">Six questions, one chart each. Hover for the exact figures; Figures opens the numbers behind any chart.</p>
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
      <ColourKey />

      {/* headline figures */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        <Kpi label={last ? `Claimed · ${monthShort(last.month)}` : 'Claimed'} value={last ? money(last.totalClaim) : '—'} sub={prev ? `${monthShort(prev.month)}: ${money(prev.totalClaim)}` : undefined} />
        <Kpi label={last ? `Costs · ${monthShort(last.month)}` : 'Costs'} value={last ? money(last.totalCosts) : '—'} sub={prev ? `${monthShort(prev.month)}: ${money(prev.totalCosts)}` : undefined} />
        <Kpi label={last ? `Margin · ${monthShort(last.month)}` : 'Margin'} value={marginOf(last) == null ? '—' : percent(marginOf(last))} tone={marginOf(last) == null ? undefined : marginOf(last) < 0 ? BAD : GOOD}
          sub={marginOf(prev) == null ? undefined : `${monthShort(prev.month)}: ${percent(marginOf(prev))}`} />
        <Kpi label={`${word('profitPerHour')} · completed`} value={overall == null ? '—' : `${cents(overall)}/hr`} sub={`${completed.length} job${completed.length === 1 ? '' : 's'} · ${monthLabel}`} />
        <Kpi label="Over quote" value={over.length} tone={over.length ? BAD : undefined} sub={`of ${quotedDone.length} quoted job${quotedDone.length === 1 ? '' : 's'}`} />
        <Kpi label="Site progress" value={siteAvg == null ? '—' : `${Math.round(siteAvg)}%`} sub={siteRows.length ? `${siteRows.length} job${siteRows.length === 1 ? '' : 's'} recording · ${onSiteNow.length} on site now` : 'nothing recorded yet'} />
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <ChartCard title="Claimed against costs, by month" question="Are we billing more than we spend?"
          series={[{ name: 'Claimed', color: ACTUAL }, { name: 'Costs', color: COMPARE }]}
          footnote={byMonth.length ? `${byMonth.length} month${byMonth.length === 1 ? '' : 's'} logged${byMonth.some((t) => t.month === now) ? `, the last one still being claimed` : ''}. A month where the orange bar is taller cost more than it billed.` : undefined}
          table={<table><caption>Claimed and costs by month</caption><tbody>{moneyByMonth.map((d) => <tr key={d.label}><th scope="row">{d.fullLabel}</th><td>Claimed {money(d.values[0])}</td><td>Costs {money(d.values[1])}</td></tr>)}</tbody></table>}>
          <BarChart data={moneyByMonth} series={[{ name: 'Claimed', color: ACTUAL }, { name: 'Costs', color: COMPARE }]} valueFormat={money} axisFormat={compactMoney} emptyMessage="No month-by-month claims logged yet." />
        </ChartCard>

        <ChartCard title="Margin by month" question="Is the margin holding up, or sliding?"
          footnote="Claimed minus costs, as a share of what was claimed, for each complete month. Green above the line is money kept; red below is a month that cost more than it billed."
          table={<table><caption>Margin by month</caption><tbody>{marginByMonth.map((d) => <tr key={d.label}><th scope="row">{d.fullLabel}</th><td>{d.values[0] == null ? '—' : percent(d.values[0])}</td></tr>)}</tbody></table>}>
          <LineChart points={marginByMonth} mode="zero" series={[{ name: 'Margin', aboveColor: GOOD, belowColor: BAD }]} aboveLabel="Margin" belowLabel="Loss"
            valueFormat={(v) => (v == null ? '—' : percent(v))} axisFormat={(v) => `${Math.round(v * 100)}%`} emptyMessage="No month-by-month claims logged yet." />
        </ChartCard>

        <ChartCard title={`${word('profitPerHour')} by type of work — completed jobs`} question="Which work pays best per hour, once it's finished?"
          footnote={`${monthLabel}${work === 'all' ? '' : ` · ${work}`}. Profit ÷ hours worked, weighted by hours. Green is at or above the overall ${overall == null ? '' : cents(overall) + '/hr'}; red lost money. Type of work is set on Completed jobs.`}
          table={<table><caption>Profit per hour by type of work, completed jobs</caption><tbody>{profitByType.map((r) => <tr key={r.label}><th scope="row">{r.label}</th><td>{r.jobs} job{r.jobs === 1 ? '' : 's'}</td><td>{r.hours} h</td><td>{cents(r.gp)}/hr</td></tr>)}</tbody></table>}>
          <HBarChart rows={profitByType} series={[{ name: word('profitPerHour'), color: ACTUAL }]} labelWidth={170} valueFormat={(v) => `${cents(v)}/hr`} axisFormat={compactMoney} emptyMessage="No completed jobs for this month and type of work." />
        </ChartCard>

        <ChartCard title="Hours worked against the quote — quoted jobs" question="Which quoted jobs took longer than they were sold for?"
          series={[{ name: 'Hours worked', color: ACTUAL }, { name: 'Quoted hours', color: COMPARE }]}
          footnote={`${monthLabel}. The jobs furthest over their quote first; a red figure is over. Up to twelve shown — the rest are on Completed jobs.`}
          table={<table><caption>Hours worked against quoted hours</caption><tbody>{hoursVsQuote.map((r) => <tr key={r.label}><th scope="row">{r.label}</th><td>Worked {roundHours(r.values[0])} h</td><td>Quoted {roundHours(r.values[1])} h</td><td>{r.note}</td></tr>)}</tbody></table>}>
          <HBarChart rows={hoursVsQuote} series={[{ name: 'Hours worked', color: ACTUAL }, { name: 'Quoted hours', color: COMPARE }]} labelWidth={190} valueFormat={(v) => `${roundHours(v)} h`} axisFormat={(v) => `${roundHours(v)}h`} emptyMessage="No quoted jobs with a quoted hours figure for this month." />
        </ChartCard>

        <ChartCard title="Built against claimed — active jobs" question="Are we claiming ahead of the build, or behind it?"
          footnote="Each dot is a job: across is what the crew have recorded as built in the field app, up is what has been claimed as a share of the quoted price. On the line is in step. Below the line is work done but not yet billed; above it is billed ahead of the build. Click a dot to open the job."
          table={<table><caption>Built against claimed</caption><tbody>{builtVsClaimed.map((p) => <tr key={p.label}><th scope="row">{p.label}</th><td>Built {p.x}%</td><td>Claimed {p.y}%</td><td>{p.gap > 0 ? `${p.gap} points ahead` : p.gap < 0 ? `${-p.gap} points behind` : 'in step'}</td></tr>)}</tbody></table>}>
          <ScatterChart points={builtVsClaimed} xLabel="Built (site progress)" yLabel="Claimed (% of quote)" format={(v) => `${Math.round(v)}%`}
            colorFor={(p) => (p.gap <= -15 ? BAD : ACTUAL)} onSelect={(p) => openJob(p.jobNumber)}
            emptyMessage="Appears once the crew record progress in the field app — nothing recorded on an active job yet." />
        </ChartCard>

        <ChartCard title="Quote accuracy by type of work — active jobs" question="Which kind of work are we pricing right?"
          series={[{ name: `${word('profitPerHour')} so far`, color: ACTUAL }, { name: `Quoted ${word('profitPerHour')}`, color: COMPARE }]}
          footnote="From the workbook, for the jobs still running. Both weighted by hours. A red figure is a type earning less than 85% of what it was priced at per hour — a pricing question, not a bad week on one site."
          table={<table><caption>Quoted and actual profit per hour by type of work, active jobs</caption><tbody>{quoteAccuracy.map((r) => <tr key={r.label}><th scope="row">{r.label}</th><td>{r.jobs} job{r.jobs === 1 ? '' : 's'}</td><td>So far {money(r.values[0])}/hr</td><td>Quoted {money(r.values[1])}/hr</td></tr>)}</tbody></table>}>
          <HBarChart rows={quoteAccuracy} series={[{ name: `${word('profitPerHour')} so far`, color: ACTUAL }, { name: `Quoted ${word('profitPerHour')}`, color: COMPARE }]} labelWidth={170} valueFormat={(v) => `${money(v)}/hr`} axisFormat={compactMoney} emptyMessage="No active jobs have a type of work set yet." />
        </ChartCard>
      </div>
    </div>
  )
}
