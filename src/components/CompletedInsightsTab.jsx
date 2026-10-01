import { Fragment, useEffect, useMemo, useState } from 'react'
import { cents, money } from '../lib/format'
import CollapsibleSection from './CollapsibleSection'
import LastSynced from './LastSynced'
import DataTable from './table/DataTable'
import GpCell from './table/GpCell'
import { useDataTable } from './table/useDataTable'
import { fetchJobCategories } from '../lib/jobCategoryStore'
import { JOB_CATEGORIES } from '../lib/jobCategories'
import { monthName, personMonthly, projectGpPerHour, projectProfit } from '../lib/completedJobPeople'

// The summaries that used to sit on top of the Completed jobs table: how many
// jobs of each type of work (split charge-up / quoted), and each person's
// totals on quoted jobs. Every count opens the jobs behind it; a job opens on
// the Completed jobs tab.

const TYPE_LABEL = { quoted: 'Quoted', chargeup: 'Charge-up' }
const NOT_SET = 'Not set'

// Project GP/hr (profit to date ÷ actual hours) — see completedJobPeople.js. The
// labour-only rate isn't shown; it only splits a job between its people.
const projectGp = projectGpPerHour
// Over a set of jobs, weighted by hours: total profit to date ÷ total actual
// hours. Jobs with no actual hours have no GP/hr and are left out.
function rate(all) {
  const jobs = all.filter((j) => projectGp(j) !== null)
  const h = jobs.reduce((t, j) => t + j.hours, 0)
  return h ? jobs.reduce((t, j) => t + projectProfit(j), 0) / h : null
}

const TYPE_GROUPS = [
  { key: 'chargeup', label: 'Charge-up' },
  { key: 'quoted', label: 'Quoted' },
  { key: 'all', label: 'All jobs' },
]
const WORKTYPE_COLUMNS = [
  { key: 'cat', label: 'Type of work', text: true, always: true, width: 220, cellClass: 'font-medium',
    render: (r) => <span className={r.cat === NOT_SET ? 'text-amber-300' : 'text-white'}>{r.cat}</span> },
  { key: 'cuN', group: 'chargeup', label: 'Jobs', num: true, always: true, render: (r) => <Num n={r.cuN} /> },
  { key: 'cuGp', group: 'chargeup', label: 'GP/hr', num: true, always: true, fmt: cents, render: (r, ctx) => <GpCell value={r.cuGp} max={ctx.max} benchmark={ctx.benchmark} /> },
  { key: 'qN', group: 'quoted', label: 'Jobs', num: true, always: true, render: (r) => <Num n={r.qN} /> },
  { key: 'qGp', group: 'quoted', label: 'GP/hr', num: true, always: true, fmt: cents, render: (r, ctx) => <GpCell value={r.qGp} max={ctx.max} benchmark={ctx.benchmark} /> },
  { key: 'n', group: 'all', label: 'Jobs', num: true, always: true, render: (r) => <Num n={r.n} /> },
  { key: 'gp', group: 'all', label: 'GP/hr', num: true, always: true, fmt: cents, render: (r, ctx) => <GpCell value={r.gp} max={ctx.max} benchmark={ctx.benchmark} /> },
]
const Num = ({ n }) => (n ? <span className="text-[14px] tabular-nums text-white">{n}</span> : <span className="text-neutral-600">0</span>)
const SHOW = [{ key: 'all', label: 'All' }, { key: 'chargeup', label: 'Charge-up' }, { key: 'quoted', label: 'Quoted' }]

// One row per type of work: how many charge-up and quoted jobs, and each
// group's project GP/hr (profit to date ÷ actual hours, weighted by hours).
// Click a row to see the jobs behind it; a job opens on the Completed jobs tab.
function WorkTypeBreakdown({ jobs, categories, onOpenJob }) {
  const [open, setOpen] = useState(() => new Set())
  const [show, setShow] = useState('all')
  const rows = useMemo(() => {
    const m = new Map()
    for (const j of jobs) {
      const cat = categories?.[j.jobNumber] || NOT_SET
      if (!m.has(cat)) m.set(cat, [])
      m.get(cat).push(j)
    }
    const make = (cat, list) => {
      const cu = list.filter((j) => j.type === 'chargeup'), q = list.filter((j) => j.type === 'quoted')
      return { cat, list, cu, q, cuN: cu.length, cuGp: rate(cu), qN: q.length, qGp: rate(q), n: list.length, gp: rate(list) }
    }
    return [...JOB_CATEGORIES, NOT_SET].filter((c) => m.has(c)).map((c) => make(c, m.get(c)))
  }, [jobs, categories])
  const all = useMemo(() => ({ cuN: jobs.filter((j) => j.type === 'chargeup').length, qN: jobs.filter((j) => j.type === 'quoted').length, n: jobs.length,
    cuGp: rate(jobs.filter((j) => j.type === 'chargeup')), qGp: rate(jobs.filter((j) => j.type === 'quoted')), gp: rate(jobs), cat: 'All types of work' }), [jobs])
  const table = useDataTable({ id: 'completedInsights.workType', columns: WORKTYPE_COLUMNS, rows, defaultSort: { key: 'n', dir: -1 }, numbersFirst: 'desc' })
  const max = Math.max(0, ...rows.flatMap((r) => [r.cuGp ?? 0, r.qGp ?? 0, r.gp ?? 0]))
  const toggle = (cat) => setOpen((prev) => { const next = new Set(prev); next.has(cat) ? next.delete(cat) : next.add(cat); return next })

  const detail = (r) => {
    const list = (show === 'all' ? r.list : show === 'chargeup' ? r.cu : r.q).slice().sort((a, b) => (projectGp(b) ?? -Infinity) - (projectGp(a) ?? -Infinity))
    return (
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2 text-[12px] text-neutral-400">
          <span>{list.length} job{list.length === 1 ? '' : 's'} · {r.cat}</span>
          <span className="flex overflow-hidden rounded-full border border-white/10 text-[12px] font-medium" role="group" aria-label="Which jobs to list">
            {SHOW.map((o) => (
              <button key={o.key} type="button" onClick={(e) => { e.stopPropagation(); setShow(o.key) }} aria-pressed={show === o.key}
                className={`px-2.5 py-0.5 transition-colors ${show === o.key ? 'bg-brand-green/15 text-brand-green' : 'text-neutral-400 hover:text-white'}`}>
                {o.label}
              </button>
            ))}
          </span>
        </div>
        <table className="data-table data-table--compact">
          <thead>
            <tr><th>Job #</th><th>Job name</th><th>Type</th><th className="num">GP/hr</th><th className="num">Profit to date</th><th className="num">Actual h</th></tr>
          </thead>
          <tbody>
            {list.map((j) => (
              <tr key={j.jobNumber} className="cursor-pointer row-clickable" tabIndex={0} title="Open on the Completed jobs tab"
                onClick={(e) => { e.stopPropagation(); onOpenJob(j.jobNumber) }}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); onOpenJob(j.jobNumber) } }}>
                <td>{j.jobNumber}</td>
                <td>{j.jobName}</td>
                <td>{TYPE_LABEL[j.type]}</td>
                <td className="num font-medium text-white">{projectGp(j) === null ? '—' : cents(projectGp(j))}</td>
                <td className="num">{projectProfit(j) == null ? '—' : money(projectProfit(j))}</td>
                <td className="num">{j.hours}</td>
              </tr>
            ))}
            {list.length === 0 && <tr><td colSpan={6} className="empty-row">No {show === 'all' ? '' : TYPE_LABEL[show].toLowerCase() + ' '}jobs here.</td></tr>}
          </tbody>
        </table>
      </div>
    )
  }

  return (
    <CollapsibleSection
      className="rounded-[18px] border border-white/[0.06] bg-[#11161c] p-6"
      storageKey="completed-insights.worktype"
      title="Jobs by type of work"
      description="Each type of work's completed jobs, charge-up and quoted, with the group's project GP/hr (profit to date ÷ actual hours). Green is at or above the overall rate; the bar is against the best group. Click a row to see its jobs."
    >
      <DataTable
        table={table}
        groups={TYPE_GROUPS}
        compact
        showOnMobile
        hideToolbar
        rowKey={(r) => r.cat}
        expandable expanded={open} onToggleExpanded={toggle} renderDetail={detail}
        totals={all}
        cellCtx={{ max, benchmark: all.gp }}
        emptyText="No completed jobs yet."
      />
    </CollapsibleSection>
  )
}

const TOTAL_COLS = [
  { key: 'count', label: 'Jobs' },
  { key: 'hours', label: 'Hours' },
  { key: 'weightedGp', label: 'Their GP' },
]
const OVER = 'var(--viz-critical)'

// One column per month (their GP, hours beside it) and a Total across all months.
// Their GP = for each job, the share of their time spent on it × their GP on that
// job, added up (see timeWeighted). Someone whose latest-month number is below the
// month before is flagged red.
// Sorting: name, any month's GP, or any total column.
function PeopleSummary({ jobs, scope, onOpenJob }) {
  const [sort, setSort] = useState({ key: 'weightedGp', dir: -1 })
  const [open, setOpen] = useState(() => new Set())
  const { months, latest, previous, people: all } = useMemo(() => personMonthly(jobs), [jobs])
  const people = useMemo(() => {
    const val = (p) => (sort.key.startsWith('m:') ? p.monthly[sort.key.slice(2)]?.weightedGp ?? null : p[sort.key])
    return [...all].sort((a, b) => {
      if (sort.key === 'name') return a.name.localeCompare(b.name) * sort.dir
      const av = val(a), bv = val(b)
      if (av === null || bv === null) return (av === null) - (bv === null)   // no work that month: last
      return (av - bv) * sort.dir
    })
  }, [all, sort])
  const flagged = all.filter((p) => p.flag)
  const toggle = (name) => setOpen((prev) => { const next = new Set(prev); next.has(name) ? next.delete(name) : next.add(name); return next })
  const sortBy = (key) => setSort((prev) => (prev.key === key ? { key, dir: -prev.dir } : { key, dir: key === 'name' ? 1 : -1 }))
  const arrow = (key) => (sort.key === key ? (sort.dir === 1 ? ' ▲' : ' ▼') : '')
  const th = (key, label, extra = '') => (
    <th key={key} className={`sortable ${extra}`} onClick={() => sortBy(key)}
      aria-sort={sort.key === key ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}>{label}{arrow(key)}</th>
  )
  const span = 1 + months.length + TOTAL_COLS.length

  return (
    <CollapsibleSection
      className="rounded-[18px] border border-white/[0.06] bg-[#11161c] p-6"
      storageKey="completed-jobs.people"
      title={`By person — ${all.length} ${all.length === 1 ? 'person' : 'people'}`}
      description={`Quoted jobs only — charge-up jobs aren't split per person. Each person's GP month by month, and in Total for every month added together: for each job, the share of their time they spent on it × their GP on that job, added up across ${scope}. Red = they did worse than the month before. Click a person to see their jobs, and a job to open it.`}
    >
      {flagged.length > 0 && (
        <div className="mt-2 rounded-[12px] border p-3 text-[13px]" style={{ borderColor: `color-mix(in srgb, ${OVER} 45%, transparent)`, background: `color-mix(in srgb, ${OVER} 7%, transparent)` }}>
          <p className="font-medium" style={{ color: OVER }}>
            {flagged.length} {flagged.length === 1 ? 'person' : 'people'} did worse in {monthName(latest)} than in {monthName(previous)}
          </p>
          <ul className="mt-1 flex flex-col gap-0.5 text-neutral-300">
            {flagged.map((p) => (
              <li key={p.name}>
                <span className="font-medium text-white">{p.name}</span> — down on {monthName(previous)}
              </li>
            ))}
          </ul>
        </div>
      )}
      {months.length <= 1 && (
        <p className="mt-2 text-[12px] text-neutral-500">
          {months.length ? `Only ${monthName(months[0])} is loaded so far` : 'No months loaded yet'} — once another month is added, each person&apos;s months sit side by side here and anyone doing worse than the month before is flagged red.
        </p>
      )}
      <div className="table-scroll mt-2">
        <table className="data-table data-table--compact">
          <thead>
            <tr>
              {th('name', 'Person')}
              {months.map((m) => th(`m:${m}`, `${monthName(m, 'short')} GP`, 'num'))}
              {TOTAL_COLS.map((c) => th(c.key, `${months.length > 1 ? 'Total ' : ''}${c.label}`, 'num'))}
            </tr>
          </thead>
          <tbody>
            {people.map((p) => {
              const isOpen = open.has(p.name)
              return (
                <Fragment key={p.name}>
                  <tr className="cursor-pointer" tabIndex={0} aria-expanded={isOpen} onClick={() => toggle(p.name)}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(p.name) } }}
                    style={p.flag ? { background: `color-mix(in srgb, ${OVER} 10%, transparent)` } : undefined}>
                    <td style={p.flag ? { boxShadow: `inset 4px 0 0 ${OVER}` } : undefined}>
                      <span className={`mr-2 inline-block text-neutral-500 transition-transform ${isOpen ? 'rotate-90' : ''}`} aria-hidden="true">›</span>
                      {p.name}
                    </td>
                    {months.map((m) => {
                      const v = p.monthly[m]
                      const down = p.flag && m === latest
                      return (
                        <td key={m} className="num" style={down ? { color: OVER, fontWeight: 700 } : undefined}
                          title={down ? `Down on ${monthName(previous)}` : undefined}>
                          {v ? (
                            <span className={down ? 'blink-over' : ''}>
                              {down && '↓ '}{cents(v.weightedGp)}
                              <span className="ml-1 text-[11px] font-normal text-neutral-500">{v.hours} h</span>
                            </span>
                          ) : <span className="text-neutral-600">—</span>}
                        </td>
                      )
                    })}
                    <td className="num">{p.count}</td>
                    <td className="num">{p.hours}</td>
                    <td className="num font-medium">{p.weightedGp === null ? '—' : cents(p.weightedGp)}</td>
                  </tr>
                  {isOpen && (
                    <tr>
                      <td colSpan={span} className="bg-white/[0.02]">
                        <div className="flex max-w-3xl flex-col gap-1.5 py-2 pl-6 text-[13px]">
                          <div className="grid grid-cols-[4rem_minmax(0,1fr)_5rem_4rem_8rem_6rem] gap-x-4 text-[11px] uppercase tracking-wide text-neutral-500">
                            <span>Job #</span><span>Job name</span><span>Month</span><span className="text-right">Hours</span><span className="text-right">Share of their time</span><span className="text-right">Their GP</span>
                          </div>
                          {[...p.jobs].sort((a, b) => (b.job.month ?? '').localeCompare(a.job.month ?? '')).map(({ job, hours, part, timeShare }) => (
                            <button type="button" key={job.jobNumber} onClick={() => onOpenJob(job.jobNumber)} title="Open on the Completed jobs tab"
                              className="grid grid-cols-[4rem_minmax(0,1fr)_5rem_4rem_8rem_6rem] gap-x-4 rounded text-left tabular-nums hover:bg-white/[0.05]">
                              <span className="text-neutral-400">{job.jobNumber}</span>
                              <span className="truncate text-neutral-200">{job.jobName}</span>
                              <span className="text-neutral-400">{monthName(job.month, 'short')}</span>
                              <span className="text-right text-neutral-300">{hours} h</span>
                              <span className="text-right text-neutral-400">{Math.round(timeShare * 1000) / 10}%</span>
                              <span className="text-right text-white">{cents(part)}</span>
                            </button>
                          ))}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
            {people.length === 0 && <tr><td colSpan={span} className="empty-row">No per-person hours yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </CollapsibleSection>
  )
}

export default function CompletedInsightsTab({ completedJobs, onBack, onOpenJob }) {
  const [categories, setCategories] = useState(null)
  useEffect(() => {
    let live = true
    fetchJobCategories().then((c) => { if (live) setCategories(c) }).catch(() => { if (live) setCategories({}) })
    return () => { live = false }
  }, [])
  const quoted = useMemo(() => completedJobs.filter((j) => j.type === 'quoted'), [completedJobs])

  return (
    <div className="mx-auto flex w-full max-w-[1800px] flex-col gap-6">
      <nav className="flex items-center gap-1.5 text-sm text-text-muted">
        <button className="transition-colors hover:text-text-primary" onClick={onBack}>Operations overview</button>
        <span aria-hidden="true">/</span>
        <span className="text-text-primary">Completed insights</span>
      </nav>
      <div>
        <h1 className="text-2xl font-semibold text-white">Completed insights</h1>
        <div className="mt-1"><LastSynced kind="completed" /></div>
        <p className="mt-1 text-sm text-neutral-400">
          The {completedJobs.length} completed jobs summed up by type of work and by person. Click a number
          or a person to see the jobs behind it; click a job to open it on the Completed jobs tab.
        </p>
      </div>
      <WorkTypeBreakdown jobs={completedJobs} categories={categories} onOpenJob={onOpenJob} />
      <PeopleSummary jobs={quoted} scope="the completed quoted jobs" onOpenJob={onOpenJob} />
    </div>
  )
}
