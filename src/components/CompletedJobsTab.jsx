import { Fragment, useMemo, useState } from 'react'
import { money } from '../lib/format'
import CollapsibleSection from './CollapsibleSection'

// Added by scripts/add-completed-job.mjs, one job at a time — see that
// script for how profit and hours are worked out for a quoted vs a
// charge-up job. Sorted by GP/hour by default: the whole point of this tab
// is spotting which finished jobs actually paid well per hour worked,
// which a plain "most profitable" or "most recent" sort wouldn't surface —
// a small quick job can easily out-earn a big one per hour.
const SORT_OPTIONS = [
  { key: 'gpPerHour', label: 'GP $/hr' },
  { key: 'profit', label: 'Profit' },
  { key: 'hours', label: 'Hours' },
  { key: 'addedAt', label: 'Date added' },
]

const TYPE_LABEL = { quoted: 'Quoted', chargeup: 'Charge-up' }

// Who did the job and who contributed: each person's hours, their share of the
// job's hours, and the same share of its GP/hr and of its profit (× their hours
// ÷ total hours) — so the people on a job add back up to the job's figures.
//
// Katipolt lists a person's after-hours rate as its own line ("Sean Baines After
// Hours") and corrections as negative lines, so lines are merged per person and
// netted first. Anyone left at zero or below was an adjustment, not a
// contribution: they're listed separately and left out of the split, so the
// shares still add to 100% and the whole profit is allocated.
function contributors(job) {
  const people = new Map()
  for (const w of job.workers ?? []) {
    const afterHours = /\s+after\s*hours$/i.test(w.name)
    const name = w.name.replace(/\s+after\s*hours$/i, '').trim()
    const p = people.get(name) ?? { name, hours: 0, afterHours: false }
    p.hours += w.hours
    p.afterHours ||= afterHours
    people.set(name, p)
  }
  const all = [...people.values()].map((p) => ({ ...p, hours: Math.round(p.hours * 100) / 100 }))
  const worked = all.filter((p) => p.hours > 0).sort((a, b) => b.hours - a.hours)
  const total = worked.reduce((sum, p) => sum + p.hours, 0)
  return {
    // gpShare = the job's GP/hr × (their hours ÷ total hours); the shares add up to the job's GP/hr.
    worked: worked.map((p) => ({ ...p, share: p.hours / total, profitShare: (job.profit * p.hours) / total, gpShare: (job.gpPerHour * p.hours) / total })),
    adjustments: all.filter((p) => p.hours <= 0),
  }
}

function WorkedBy({ job }) {
  const people = contributors(job).worked
  if (!people.length) return <span className="text-neutral-500">—</span>
  return (
    <span>
      <span className="text-neutral-200">{people[0].name}</span>
      {people.length > 1 && <span className="text-neutral-500"> +{people.length - 1} more</span>}
    </span>
  )
}

const GRID = 'grid grid-cols-[minmax(0,1.6fr)_minmax(0,1.6fr)_4rem_3rem_6rem_5.5rem] gap-x-4'
const GRID_ONE = 'grid grid-cols-[minmax(0,1.6fr)_minmax(0,1.6fr)_4rem_3rem_5.5rem] gap-x-4'

function Breakdown({ job }) {
  const { worked: people, adjustments } = contributors(job)
  if (!people.length) {
    return <p className="text-[13px] text-neutral-500">No per-person hours for this job — its timesheet export wasn&apos;t included.</p>
  }
  return (
    <div className="flex flex-col gap-2.5">
      <p className="text-[12px] text-neutral-500">
        {people.length === 1
          ? 'One person did all the hours on this job.'
          : `${people.length} people worked on this job — GP/hr and profit split by each person's share of the hours (the shares add up to the job's ${money(job.gpPerHour)}/hr).`}
      </p>
      {people.length > 1 && (
        <div className={`${GRID} text-[11px] uppercase tracking-wide text-neutral-500`}>
          <span>Person</span>
          <span />
          <span className="text-right">Hours</span>
          <span className="text-right">Share</span>
          <span className="text-right">GP/hr share</span>
          <span className="text-right">Profit share</span>
        </div>
      )}
      {people.map((p, i) => (
        <div key={p.name} className={`${people.length > 1 ? GRID : GRID_ONE} items-center text-[13px]`}>
          <span className="truncate text-neutral-100">
            {p.name}
            {p.afterHours && <span className="ml-1.5 text-[11px] text-neutral-500">incl. after-hours</span>}
            {i === 0 && people.length > 1 && (
              <span className="ml-2 rounded-full border border-brand-green/40 px-2 py-0.5 text-[11px] text-brand-green">Most hours</span>
            )}
          </span>
          <span className="h-2 overflow-hidden rounded-full bg-white/[0.06]" aria-hidden="true">
            <span className="block h-full rounded-full bg-brand-green" style={{ width: `${Math.max(2, p.share * 100)}%` }} />
          </span>
          <span className="text-right tabular-nums text-neutral-300">{Math.round(p.hours * 100) / 100} h</span>
          <span className="text-right tabular-nums text-neutral-400">{Math.round(p.share * 100)}%</span>
          {people.length > 1 && <span className="text-right tabular-nums font-medium text-white">{money(p.gpShare)}/hr</span>}
          <span className="text-right tabular-nums text-neutral-200">{money(p.profitShare)}</span>
        </div>
      ))}
      {adjustments.map((p) => (
        <p key={p.name} className="text-[12px] text-neutral-500">
          {p.name}: {p.hours} h adjustment on the invoice — not counted in the split.
        </p>
      ))}
    </div>
  )
}

export default function CompletedJobsTab({ completedJobs, onBack }) {
  const [sort, setSort] = useState({ key: 'gpPerHour', dir: -1 })
  const [open, setOpen] = useState(() => new Set())
  function toggleOpen(jobNumber) {
    setOpen((prev) => { const next = new Set(prev); next.has(jobNumber) ? next.delete(jobNumber) : next.add(jobNumber); return next })
  }

  function toggleSort(key) {
    setSort((prev) => (prev.key === key ? { key, dir: -prev.dir } : { key, dir: -1 }))
  }

  const rows = useMemo(() => {
    return [...completedJobs].sort((a, b) => {
      const av = a[sort.key]
      const bv = b[sort.key]
      if (typeof av === 'string') return av.localeCompare(bv) * sort.dir
      return ((av ?? 0) - (bv ?? 0)) * sort.dir
    })
  }, [completedJobs, sort])

  return (
    <div className="mx-auto flex w-full max-w-[1800px] flex-col gap-6">
      <nav className="flex items-center gap-1.5 text-sm text-text-muted">
        <button className="transition-colors hover:text-text-primary" onClick={onBack}>
          Operations overview
        </button>
        <span aria-hidden="true">/</span>
        <span className="text-text-primary">Completed jobs</span>
      </nav>

      <div>
        <h1 className="text-2xl font-semibold text-white">Completed jobs — GP per hour</h1>
        <p className="mt-1 text-sm text-neutral-400">
          Profit ÷ actual hours for each finished job — a quoted job&apos;s Quoted Profit
          against its actual hours worked, a charge-up job&apos;s billed profit against its
          billed hours. Click a job to see who worked on it and how the profit splits by
          their hours. Add a month&apos;s jobs in Update data → Completed jobs.
        </p>
      </div>

      <CollapsibleSection
        className="rounded-[18px] border border-white/[0.06] bg-[#11161c] p-6"
        storageKey="completed-jobs.table"
        title={`${completedJobs.length} completed job${completedJobs.length === 1 ? '' : 's'}`}
      >
        {/* Mobile: one stacked card per job. */}
        <div className="mt-4 flex flex-col gap-3 sm:hidden">
          {rows.map((j) => (
            <div
              key={j.jobNumber}
              role="button"
              tabIndex={0}
              aria-expanded={open.has(j.jobNumber)}
              onClick={() => toggleOpen(j.jobNumber)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleOpen(j.jobNumber) } }}
              className="flex cursor-pointer flex-col gap-3 rounded-[14px] border border-white/[0.06] bg-white/[0.02] p-4"
            >
              <div>
                <p className="text-[14px] font-medium text-white">
                  <span className="text-neutral-400">{j.jobNumber}</span> {j.jobName}
                </p>
                <p className="mt-0.5 text-[12px] text-neutral-500">{TYPE_LABEL[j.type] ?? j.type}</p>
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[13px]">
                <span className="text-neutral-400">Profit</span>
                <span className="text-right tabular-nums text-neutral-200">{money(j.profit)}</span>
                <span className="text-neutral-400">Hours</span>
                <span className="text-right tabular-nums text-neutral-200">{j.hours}</span>
                <span className="text-neutral-400">GP $/hr</span>
                <span className="text-right tabular-nums font-medium text-white">{money(j.gpPerHour)}</span>
              </div>
              <p className="text-[12px] text-neutral-500">
                <WorkedBy job={j} /> · {open.has(j.jobNumber) ? 'Hide' : 'Show'} who worked on it
              </p>
              {open.has(j.jobNumber) && <div className="border-t border-white/10 pt-3"><Breakdown job={j} /></div>}
            </div>
          ))}
          {rows.length === 0 && <p className="empty-row">No completed jobs added yet.</p>}
        </div>

        <div className="table-scroll hidden sm:block">
          <table className="data-table">
            <thead>
              <tr>
                <th>Job #</th>
                <th>Job name</th>
                <th>Type</th>
                <th>Worked by</th>
                {SORT_OPTIONS.map((col) => (
                  <th
                    key={col.key}
                    className="num sortable"
                    onClick={() => toggleSort(col.key)}
                    aria-sort={sort.key === col.key ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}
                  >
                    {col.label}
                    {sort.key === col.key && (sort.dir === 1 ? ' ▲' : ' ▼')}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((j) => {
                const isOpen = open.has(j.jobNumber)
                return (
                  <Fragment key={j.jobNumber}>
                    <tr
                      className="cursor-pointer"
                      tabIndex={0}
                      aria-expanded={isOpen}
                      onClick={() => toggleOpen(j.jobNumber)}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleOpen(j.jobNumber) } }}
                    >
                      <td>
                        <span className={`mr-2 inline-block text-neutral-500 transition-transform ${isOpen ? 'rotate-90' : ''}`} aria-hidden="true">›</span>
                        {j.jobNumber}
                      </td>
                      <td>{j.jobName}</td>
                      <td>{TYPE_LABEL[j.type] ?? j.type}</td>
                      <td><WorkedBy job={j} /></td>
                      <td className="num">{money(j.gpPerHour)}</td>
                      <td className="num">{money(j.profit)}</td>
                      <td className="num">{j.hours}</td>
                      <td className="num">{j.addedAt}</td>
                    </tr>
                    {isOpen && (
                      <tr>
                        <td colSpan={8} className="bg-white/[0.02]">
                          <div className="max-w-3xl py-2 pl-6"><Breakdown job={j} /></div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={8} className="empty-row">
                    No completed jobs added yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </CollapsibleSection>
    </div>
  )
}
