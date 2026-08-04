import { ArrowLeft, Printer } from 'lucide-react'
import Logo from './Logo'
import { money, percent } from '../lib/format'
import { statusReasons } from '../lib/statusReasons'

const GENERATED = new Intl.DateTimeFormat('en-NZ', {
  dateStyle: 'long',
  timeStyle: 'short',
}).format(new Date())

const COLUMNS = [
  { key: 'job', label: 'Job' },
  { key: 'reason', label: 'Reason(s) flagged' },
  { key: 'quoted', label: 'Quoted cost', num: true },
  { key: 'actual', label: 'Actual cost', num: true },
  { key: 'variance', label: 'Variance', num: true },
  { key: 'hours', label: 'Hours (quoted/actual)', num: true },
  { key: 'margin', label: 'Margin (actual/quoted)', num: true },
  { key: 'remaining', label: 'Remaining to claim', num: true },
]

export default function ReviewReport({ jobs, onBack }) {
  const overBudgetJobs = jobs.filter((j) => j.overBudget)
  const totalOverBudgetAmount = overBudgetJobs.reduce(
    (sum, j) => sum + (j.totalActualCost - j.totalQuotedCost),
    0
  )
  const losingMarginCount = jobs.filter((j) => j.losingMargin).length

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 print:max-w-none">
      <div className="flex items-center justify-between print:hidden">
        <button
          onClick={onBack}
          className="flex w-fit items-center gap-1.5 rounded-full border border-white/10 px-3.5 py-1.5 text-sm text-neutral-300 transition-colors hover:border-white/20 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-green"
        >
          <ArrowLeft size={14} aria-hidden="true" />
          Back
        </button>
        <button
          onClick={() => window.print()}
          className="flex w-fit items-center gap-1.5 rounded-full bg-brand-green px-3.5 py-1.5 text-sm font-medium text-[#06210a] transition-colors hover:bg-brand-green/90"
        >
          <Printer size={14} aria-hidden="true" />
          Print
        </button>
      </div>

      <div className="rounded-[18px] border border-white/[0.06] bg-[#11161c] p-7 print:border-none print:bg-white print:p-0 print:text-black">
        <div className="flex items-start justify-between gap-4 border-b border-white/10 pb-5 print:border-neutral-300">
          <div>
            <h1 className="text-2xl font-bold text-white print:text-black">Needs Review Report</h1>
            <p className="mt-1 text-sm text-neutral-500 print:text-neutral-600">
              Cassidy-Davies Electrical · Generated {GENERATED} · {jobs.length} job
              {jobs.length === 1 ? '' : 's'} flagged
            </p>
            {jobs.length > 0 && (
              <p className="mt-1 text-sm text-neutral-500 print:text-neutral-600">
                {overBudgetJobs.length} over budget by {money(totalOverBudgetAmount)} combined ·{' '}
                {losingMarginCount} losing margin
              </p>
            )}
          </div>
          <Logo size={40} />
        </div>

        {jobs.length === 0 && (
          <p className="py-8 text-center text-sm text-neutral-500 print:text-neutral-600">
            Nothing flagged right now.
          </p>
        )}

        {jobs.length > 0 && (
          <div className="mt-5 overflow-x-auto print:overflow-visible">
            <table className="w-full border-collapse text-[13px]">
              <thead>
                <tr className="border-b border-white/10 print:border-neutral-400">
                  {COLUMNS.map((col) => (
                    <th
                      key={col.key}
                      className={`px-2 py-2 font-medium text-neutral-500 print:text-neutral-700 ${
                        col.num ? 'text-right tabular-nums' : 'text-left'
                      }`}
                    >
                      {col.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {jobs.map((job) => {
                  const reasons = statusReasons(job)
                  const variance =
                    job.totalActualCost !== null && job.totalQuotedCost !== null
                      ? job.totalActualCost - job.totalQuotedCost
                      : null

                  return (
                    <tr
                      key={job.jobNumber}
                      className="border-b border-white/10 align-top print:break-inside-avoid print:border-neutral-300"
                    >
                      <td className="px-2 py-3">
                        <p className="text-neutral-500 tabular-nums print:text-neutral-600">
                          Job {job.jobNumber}
                        </p>
                        <p className="font-semibold text-white print:text-black">{job.jobName}</p>
                      </td>
                      <td className="max-w-[220px] px-2 py-3">
                        {reasons.map((reason) => (
                          <p key={reason} className="text-amber-400 print:text-neutral-800">
                            • {reason}
                          </p>
                        ))}
                      </td>
                      <td className="px-2 py-3 text-right tabular-nums text-neutral-200 print:text-black">
                        {money(job.totalQuotedCost)}
                      </td>
                      <td className="px-2 py-3 text-right tabular-nums text-neutral-200 print:text-black">
                        {money(job.totalActualCost)}
                      </td>
                      <td className="px-2 py-3 text-right tabular-nums text-neutral-200 print:text-black">
                        {variance === null ? '—' : `${variance > 0 ? '+' : ''}${money(variance)}`}
                      </td>
                      <td className="px-2 py-3 text-right tabular-nums text-neutral-200 print:text-black">
                        {job.quotedLabourHours === null ? '—' : job.quotedLabourHours} /{' '}
                        {job.actualLabourHours === null ? '—' : job.actualLabourHours}
                      </td>
                      <td className="px-2 py-3 text-right tabular-nums text-neutral-200 print:text-black">
                        {percent(job.marginToDate)} / {percent(job.quotedMargin)}
                      </td>
                      <td className="px-2 py-3 text-right tabular-nums text-neutral-200 print:text-black">
                        {money(job.remainingToClaim)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
