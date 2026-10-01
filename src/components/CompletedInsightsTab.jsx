import { useEffect, useMemo, useState } from 'react'
import { cents, money } from '../lib/format'
import CollapsibleSection from './CollapsibleSection'
import LastSynced from './LastSynced'
import DataTable from './table/DataTable'
import GpCell from './table/GpCell'
import { tip, word } from '../lib/words'
import { useDataTable } from './table/useDataTable'
import { fetchJobCategories } from '../lib/jobCategoryStore'
import { JOB_CATEGORIES } from '../lib/jobCategories'
import { projectGpPerHour, projectProfit } from '../lib/completedJobPeople'

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
  { key: 'cat', label: word('typeOfWork'), text: true, always: true, width: 220, cellClass: 'font-medium',
    render: (r) => <span className={r.cat === NOT_SET ? 'text-amber-300' : 'text-white'}>{r.cat}</span> },
  { key: 'cuN', group: 'chargeup', label: 'Jobs', num: true, always: true, render: (r) => <Num n={r.cuN} /> },
  { key: 'cuGp', group: 'chargeup', label: word('profitPerHour'), title: tip('profitPerHour'), num: true, always: true, fmt: cents, render: (r, ctx) => <GpCell value={r.cuGp} max={ctx.max} benchmark={ctx.benchmark} /> },
  { key: 'qN', group: 'quoted', label: 'Jobs', num: true, always: true, render: (r) => <Num n={r.qN} /> },
  { key: 'qGp', group: 'quoted', label: word('profitPerHour'), title: tip('profitPerHour'), num: true, always: true, fmt: cents, render: (r, ctx) => <GpCell value={r.qGp} max={ctx.max} benchmark={ctx.benchmark} /> },
  { key: 'n', group: 'all', label: 'Jobs', num: true, always: true, render: (r) => <Num n={r.n} /> },
  { key: 'gp', group: 'all', label: word('profitPerHour'), title: tip('profitPerHour'), num: true, always: true, fmt: cents, render: (r, ctx) => <GpCell value={r.gp} max={ctx.max} benchmark={ctx.benchmark} /> },
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
            <tr><th>{word('jobNumber')}</th><th>{word('jobName')}</th><th>{word('jobType')}</th><th className="num">{word('profitPerHour')}</th><th className="num">{word('profit')}</th><th className="num">{word('hoursWorked')}</th></tr>
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
      description="Each type of work's completed jobs, charge-up and quoted, with each group's profit per hour (profit ÷ hours worked). Green is at or above the overall rate; the bar is against the best group. Click a row to see its jobs."
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
        emptyText="No completed jobs yet — add a month in Update data → Completed jobs."
      />
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
          The {completedJobs.length} completed jobs summed up by type of work. Click a row to see the jobs
          behind it, and a job to open it on the Completed jobs tab. The by-person figures are on Employee KPI.
        </p>
      </div>
      <WorkTypeBreakdown jobs={completedJobs} categories={categories} onOpenJob={onOpenJob} />
    </div>
  )
}
