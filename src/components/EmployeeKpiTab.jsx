import { Fragment, useMemo, useState } from 'react'
import { cents } from '../lib/format'
import CollapsibleSection from './CollapsibleSection'
import LastSynced from './LastSynced'
import TeamAvatar from './TeamAvatar'
import { teamMember } from '../lib/teamPhotos'
import { word } from '../lib/words'
import { monthName, personMonthly } from '../lib/completedJobPeople'

// Employee KPI: each person's figure on the completed quoted jobs, month by
// month, with their photo from the company's team page so it is clear who is
// who. Moved out of Completed insights into a tab of its own.

const TOTAL_COLS = [
  { key: 'count', label: 'Jobs' },
  { key: 'hours', label: 'Hours' },
  { key: 'weightedGp', label: word('personGpHour') },
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
      storageKey="employee-kpi.people"
      title={`${all.length} ${all.length === 1 ? 'person' : 'people'} on completed quoted jobs`}
      description={`Quoted jobs only — charge-up jobs aren't split per person. Each person's profit month by month, and in Total for every month added together: for each job, the share of their time they spent on it × their profit on that job, added up across ${scope}. Red = they did worse than the month before. Click a person to see their jobs, and a job to open it.`}
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
              {months.map((m) => th(`m:${m}`, `${monthName(m, 'short')} profit`, 'num'))}
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
                      <span className="flex items-center gap-3">
                        <span className={`inline-block text-neutral-500 transition-transform ${isOpen ? 'rotate-90' : ''}`} aria-hidden="true">›</span>
                        <TeamAvatar name={p.name} size={34} />
                        <span className="flex min-w-0 flex-col leading-tight">
                          <span className="font-medium text-white">{p.name}</span>
                          {teamMember(p.name)?.role && <span className="text-[11px] text-neutral-500">{teamMember(p.name).role}</span>}
                        </span>
                      </span>
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
                          <div className="grid grid-cols-[4rem_minmax(0,1fr)_5rem_4rem_6rem] gap-x-4 text-[11px] uppercase tracking-wide text-neutral-500">
                            <span>Job #</span><span>Job name</span><span>Month</span><span className="text-right">Hours</span><span className="text-right">{word('personGpHour')}</span>
                          </div>
                          {[...p.jobs].sort((a, b) => (b.job.month ?? '').localeCompare(a.job.month ?? '')).map(({ job, hours, part }) => (
                            <button type="button" key={job.jobNumber} onClick={() => onOpenJob(job.jobNumber)} title="Open on the Completed jobs tab"
                              className="grid grid-cols-[4rem_minmax(0,1fr)_5rem_4rem_6rem] gap-x-4 rounded text-left tabular-nums hover:bg-white/[0.05]">
                              <span className="text-neutral-400">{job.jobNumber}</span>
                              <span className="truncate text-neutral-200">{job.jobName}</span>
                              <span className="text-neutral-400">{monthName(job.month, 'short')}</span>
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


export default function EmployeeKpiTab({ completedJobs, onBack, onOpenJob }) {
  const quoted = useMemo(() => completedJobs.filter((j) => j.type === 'quoted'), [completedJobs])
  return (
    <div className="mx-auto flex w-full max-w-[1800px] flex-col gap-6">
      <nav className="flex items-center gap-1.5 text-sm text-text-muted">
        <button className="transition-colors hover:text-text-primary" onClick={onBack}>Operations overview</button>
        <span aria-hidden="true">/</span>
        <span className="text-text-primary">Employee KPI</span>
      </nav>
      <div>
        <h1 className="text-2xl font-semibold text-white">Employee KPI</h1>
        <div className="mt-1"><LastSynced kind="completed" /></div>
        <p className="mt-1 text-sm text-neutral-400">
          Each person&apos;s {word('personGpHour')} on the completed quoted jobs, month by month. Click a person to see
          the jobs behind the figure, and a job to open it on the Completed jobs tab.
        </p>
      </div>
      <PeopleSummary jobs={quoted} scope="the completed quoted jobs" onOpenJob={onOpenJob} />
    </div>
  )
}
