import { Fragment, useEffect, useMemo, useState } from 'react'
import { cents, money } from '../lib/format'
import CollapsibleSection from './CollapsibleSection'
import LastSynced from './LastSynced'
import { fetchJobCategories } from '../lib/jobCategoryStore'
import { JOB_CATEGORIES } from '../lib/jobCategories'
import { monthName, personMonthly } from '../lib/completedJobPeople'

// The summaries that used to sit on top of the Completed jobs table: how many
// jobs of each type of work (split charge-up / quoted), and each person's
// totals on quoted jobs. Every count opens the jobs behind it; a job opens on
// the Completed jobs tab.

const TYPE_LABEL = { quoted: 'Quoted', chargeup: 'Charge-up' }
const NOT_SET = 'Not set'

// GP/hr over a set of jobs, weighted by hours: total profit ÷ total hours.
// Jobs with no actual hours have no GP/hr and are left out.
function rate(all) {
  const jobs = all.filter((j) => j.hours > 0)
  const h = jobs.reduce((t, j) => t + j.hours, 0)
  return h ? jobs.reduce((t, j) => t + (j.profit ?? 0), 0) / h : null
}

function WorkTypeBreakdown({ jobs, categories, onOpenJob }) {
  const [pick, setPick] = useState(null) // { cat, type } — type null = both
  const byCat = useMemo(() => {
    const m = new Map()
    for (const j of jobs) {
      const cat = categories?.[j.jobNumber] || NOT_SET
      if (!m.has(cat)) m.set(cat, [])
      m.get(cat).push(j)
    }
    return m
  }, [jobs, categories])
  const order = [...JOB_CATEGORIES, NOT_SET].filter((c) => byCat.has(c))
  const of = (list, type) => (type ? list.filter((j) => j.type === type) : list)
  const picked = pick ? of(pick.cat ? byCat.get(pick.cat) ?? [] : jobs, pick.type).sort((a, b) => (b.gpPerHour ?? -Infinity) - (a.gpPerHour ?? -Infinity)) : []
  const isOn = (cat, type) => pick && pick.cat === cat && pick.type === type

  function Count({ cat, type, list }) {
    const n = list.length
    if (!n) return <span className="text-neutral-600">0</span>
    const on = Boolean(isOn(cat, type))
    return (
      <button
        type="button"
        onClick={() => setPick(on ? null : { cat, type })}
        aria-pressed={on}
        className={`min-w-8 rounded-full px-2.5 py-0.5 text-[13px] font-medium tabular-nums transition-colors ${
          on ? 'bg-brand-green/15 text-brand-green' : 'text-white hover:bg-white/[0.08]'
        }`}
        title={`Show the ${n} ${type ? TYPE_LABEL[type].toLowerCase() + ' ' : ''}job${n === 1 ? '' : 's'}${cat ? ` in ${cat}` : ''}`}
      >
        {n}
      </button>
    )
  }

  const row = (cat, list, bold) => {
    const cu = of(list, 'chargeup'), q = of(list, 'quoted')
    return (
      <tr key={cat ?? 'all'} className={bold ? 'font-medium' : ''}>
        <td className={cat === NOT_SET ? 'text-neutral-500' : ''}>{cat ?? 'All types of work'}</td>
        <td className="num"><Count cat={cat} type="chargeup" list={cu} /></td>
        <td className="num tabular-nums text-neutral-400">{cu.length ? `${cents(rate(cu))}/hr` : '—'}</td>
        <td className="num"><Count cat={cat} type="quoted" list={q} /></td>
        <td className="num tabular-nums text-neutral-400">{q.length ? `${cents(rate(q))}/hr` : '—'}</td>
        <td className="num"><Count cat={cat} type={null} list={list} /></td>
      </tr>
    )
  }

  return (
    <CollapsibleSection
      className="rounded-[18px] border border-white/[0.06] bg-[#11161c] p-6"
      storageKey="completed-insights.worktype"
      title="Jobs by type and type of work"
      description="How many completed jobs of each type of work, charge-up and quoted, with each group's GP/hr (total profit ÷ total hours). Click any number to see those jobs."
    >
      <div className="table-scroll mt-2">
        <table className="data-table data-table--compact">
          <thead>
            <tr>
              <th>Type of work</th>
              <th className="num">Charge-up</th><th className="num">Charge-up GP/hr</th>
              <th className="num">Quoted</th><th className="num">Quoted GP/hr</th>
              <th className="num">Total</th>
            </tr>
          </thead>
          <tbody>
            {order.map((cat) => row(cat, byCat.get(cat)))}
            {row(null, jobs, true)}
          </tbody>
        </table>
      </div>

      {pick && (
        <div className="mt-4 rounded-[14px] border border-white/[0.06] bg-white/[0.02] p-4">
          <div className="mb-2 flex items-baseline justify-between gap-3">
            <p className="text-[14px] font-medium text-white">
              {picked.length} {pick.type ? TYPE_LABEL[pick.type].toLowerCase() + ' ' : ''}job{picked.length === 1 ? '' : 's'} · {pick.cat ?? 'all types of work'}
            </p>
            <button type="button" onClick={() => setPick(null)} className="text-[12px] text-neutral-400 hover:text-white">Close</button>
          </div>
          <div className="table-scroll">
            <table className="data-table data-table--compact">
              <thead>
                <tr><th>Job #</th><th>Job name</th><th>Type</th><th className="num">GP/hr</th><th className="num">Profit</th><th className="num">Actual h</th></tr>
              </thead>
              <tbody>
                {picked.map((j) => (
                  <tr key={j.jobNumber} className="cursor-pointer" tabIndex={0} title="Open on the Completed jobs tab"
                    onClick={() => onOpenJob(j.jobNumber)}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpenJob(j.jobNumber) } }}>
                    <td>{j.jobNumber}</td>
                    <td>{j.jobName}</td>
                    <td>{TYPE_LABEL[j.type]}</td>
                    <td className="num font-medium">{cents(j.gpPerHour)}</td>
                    <td className="num">{money(j.profit)}</td>
                    <td className="num">{j.hours}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </CollapsibleSection>
  )
}

const TOTAL_COLS = [
  { key: 'count', label: 'Jobs' },
  { key: 'hours', label: 'Hours' },
  { key: 'profit', label: 'Labour profit' },
  { key: 'gpPerHour', label: 'GP $/hr' },
]
const OVER = 'var(--viz-critical)'

// One column per month (GP/hr, with hours under it) and a Total that adds every
// month together. Someone whose latest-month GP/hr is below the month before is
// flagged red. Sorting: name, any month's GP/hr, or any total column.
function PeopleSummary({ jobs, scope, onOpenJob }) {
  const [sort, setSort] = useState({ key: 'gpPerHour', dir: -1 })
  const [open, setOpen] = useState(() => new Set())
  const { months, latest, previous, people: all } = useMemo(() => personMonthly(jobs), [jobs])
  const people = useMemo(() => {
    const val = (p) => (sort.key.startsWith('m:') ? p.monthly[sort.key.slice(2)]?.gpPerHour ?? null : p[sort.key])
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
      description={`Quoted jobs only — charge-up jobs aren't split per person. Each person's GP/hr month by month, and in Total for every month added together: their part of the labour profit (each job's GP/hr × their hours) ÷ their hours, across ${scope}. Red = worse than the month before. Click a person to see their jobs, and a job to open it.`}
    >
      {flagged.length > 0 && (
        <div className="mt-2 rounded-[12px] border p-3 text-[13px]" style={{ borderColor: `color-mix(in srgb, ${OVER} 45%, transparent)`, background: `color-mix(in srgb, ${OVER} 7%, transparent)` }}>
          <p className="font-medium" style={{ color: OVER }}>
            {flagged.length} {flagged.length === 1 ? 'person' : 'people'} did worse in {monthName(latest)} than in {monthName(previous)}
          </p>
          <ul className="mt-1 flex flex-col gap-0.5 text-neutral-300">
            {flagged.map((p) => (
              <li key={p.name}>
                <span className="font-medium text-white">{p.name}</span> — {cents(p.flag.now)}/hr, down from {cents(p.flag.before)}/hr
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
              {months.map((m) => th(`m:${m}`, `${monthName(m, 'short')} GP/hr`, 'num'))}
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
                          title={down ? `Down from ${cents(p.flag.before)}/hr in ${monthName(previous)}` : undefined}>
                          {v ? (
                            <span className={down ? 'blink-over' : ''}>
                              {down && '↓ '}{cents(v.gpPerHour)}
                              <span className="ml-1 text-[11px] font-normal text-neutral-500">{v.hours} h</span>
                            </span>
                          ) : <span className="text-neutral-600">—</span>}
                        </td>
                      )
                    })}
                    <td className="num">{p.count}</td>
                    <td className="num">{p.hours}</td>
                    <td className="num">{cents(p.profit)}</td>
                    <td className="num font-medium">{p.gpPerHour === null ? '—' : `${cents(p.gpPerHour)}/hr`}</td>
                  </tr>
                  {isOpen && (
                    <tr>
                      <td colSpan={span} className="bg-white/[0.02]">
                        <div className="flex max-w-3xl flex-col gap-1.5 py-2 pl-6 text-[13px]">
                          <div className="grid grid-cols-[4rem_minmax(0,1fr)_5rem_5rem_4rem_6rem] gap-x-4 text-[11px] uppercase tracking-wide text-neutral-500">
                            <span>Job #</span><span>Job name</span><span>Month</span><span className="text-right">GP/hr</span><span className="text-right">Hours</span><span className="text-right">Their part</span>
                          </div>
                          {[...p.jobs].sort((a, b) => (b.job.month ?? '').localeCompare(a.job.month ?? '')).map(({ job, hours, part }) => (
                            <button type="button" key={job.jobNumber} onClick={() => onOpenJob(job.jobNumber)} title="Open on the Completed jobs tab"
                              className="grid grid-cols-[4rem_minmax(0,1fr)_5rem_5rem_4rem_6rem] gap-x-4 rounded text-left tabular-nums hover:bg-white/[0.05]">
                              <span className="text-neutral-400">{job.jobNumber}</span>
                              <span className="truncate text-neutral-200">{job.jobName}</span>
                              <span className="text-neutral-400">{monthName(job.month, 'short')}</span>
                              <span className="text-right text-neutral-400">{cents(job.gpPerHour)}</span>
                              <span className="text-right text-neutral-300">{hours} h</span>
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
