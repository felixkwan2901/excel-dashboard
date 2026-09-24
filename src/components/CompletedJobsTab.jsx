import { useMemo, useState } from 'react'
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

export default function CompletedJobsTab({ completedJobs, onBack }) {
  const [sort, setSort] = useState({ key: 'gpPerHour', dir: -1 })

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
          billed hours. Added one at a time with{' '}
          <code className="rounded bg-white/[0.06] px-1 py-0.5 text-[12px]">
            node scripts/add-completed-job.mjs
          </code>
          .
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
              className="flex flex-col gap-3 rounded-[14px] border border-white/[0.06] bg-white/[0.02] p-4"
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
              {j.workers?.length > 0 && (
                <p className="text-[12px] text-neutral-500">
                  {j.workers.map((w) => `${w.name} (${w.hours}h)`).join(', ')}
                </p>
              )}
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
              {rows.map((j) => (
                <tr key={j.jobNumber}>
                  <td>{j.jobNumber}</td>
                  <td>{j.jobName}</td>
                  <td>{TYPE_LABEL[j.type] ?? j.type}</td>
                  <td className="text-neutral-400">
                    {j.workers?.map((w) => `${w.name} (${w.hours}h)`).join(', ') ?? '—'}
                  </td>
                  <td className="num">{money(j.gpPerHour)}</td>
                  <td className="num">{money(j.profit)}</td>
                  <td className="num">{j.hours}</td>
                  <td className="num">{j.addedAt}</td>
                </tr>
              ))}
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
