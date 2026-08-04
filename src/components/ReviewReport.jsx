import { ArrowLeft, Printer } from 'lucide-react'
import { money, percent } from '../lib/format'
import { statusReasons } from '../lib/statusReasons'

const GENERATED = new Intl.DateTimeFormat('en-NZ', {
  dateStyle: 'long',
  timeStyle: 'short',
}).format(new Date())

export default function ReviewReport({ jobs, onBack }) {
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
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
        <div className="border-b border-white/10 pb-5 print:border-neutral-300">
          <h1 className="text-2xl font-bold text-white print:text-black">Needs Review Report</h1>
          <p className="mt-1 text-sm text-neutral-500 print:text-neutral-600">
            Cassidy-Davies Electrical · Generated {GENERATED} · {jobs.length} job
            {jobs.length === 1 ? '' : 's'} flagged
          </p>
        </div>

        {jobs.length === 0 && (
          <p className="py-8 text-center text-sm text-neutral-500 print:text-neutral-600">
            Nothing flagged right now.
          </p>
        )}

        <ul className="divide-y divide-white/10 print:divide-neutral-300">
          {jobs.map((job) => {
            const reasons = statusReasons(job)
            return (
              <li key={job.jobNumber} className="flex flex-wrap items-start justify-between gap-4 py-5">
                <div>
                  <p className="text-sm text-neutral-500 tabular-nums print:text-neutral-600">
                    Job {job.jobNumber}
                  </p>
                  <p className="mt-0.5 text-lg font-semibold text-white print:text-black">
                    {job.jobName}
                  </p>
                  <ul className="mt-2 flex flex-col gap-1">
                    {reasons.map((reason) => (
                      <li
                        key={reason}
                        className="text-[13px] text-amber-400 print:text-neutral-800"
                      >
                        • {reason}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-right text-[13px] tabular-nums">
                  <span className="text-neutral-500 print:text-neutral-600">Quoted cost</span>
                  <span className="text-neutral-200 print:text-black">
                    {money(job.totalQuotedCost)}
                  </span>
                  <span className="text-neutral-500 print:text-neutral-600">Actual cost</span>
                  <span className="text-neutral-200 print:text-black">
                    {money(job.totalActualCost)}
                  </span>
                  <span className="text-neutral-500 print:text-neutral-600">Margin to date</span>
                  <span className="text-neutral-200 print:text-black">
                    {percent(job.marginToDate)}
                  </span>
                </div>
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}
