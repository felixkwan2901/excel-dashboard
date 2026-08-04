import { useState } from 'react'
import { ArrowLeft, CheckCircle2, ChevronRight, RotateCcw } from 'lucide-react'
import StatusBadge from './StatusBadge'

const CURRENCY = new Intl.NumberFormat('en-NZ', {
  style: 'currency',
  currency: 'NZD',
  maximumFractionDigits: 0,
})

const DATE = new Intl.DateTimeFormat('en-NZ', {
  day: '2-digit',
  month: 'long',
  year: 'numeric',
})

const DATE_TIME = new Intl.DateTimeFormat('en-NZ', {
  day: '2-digit',
  month: 'short',
  hour: 'numeric',
  minute: '2-digit',
})

function Field({ label, children }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[13px] font-medium text-neutral-500">{label}</span>
      <div className="text-[15px] text-neutral-100">{children}</div>
    </div>
  )
}

function History({ entries }) {
  const [open, setOpen] = useState(false)

  return (
    <div className="mt-6 border-t border-white/10 pt-6">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 text-[13px] font-semibold text-neutral-300 transition-colors hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-green"
      >
        <ChevronRight
          size={14}
          className={`transition-transform duration-200 ${open ? 'rotate-90' : ''}`}
          aria-hidden="true"
        />
        History{entries.length > 0 ? ` (${entries.length})` : ''}
      </button>

      {open && (
        <ul className="mt-4 flex flex-col gap-3">
          {entries.length === 0 && (
            <p className="text-[13px] text-neutral-500">No changes recorded yet.</p>
          )}
          {entries.map((entry, i) => (
            <li
              key={`${entry.timestamp}-${i}`}
              className="flex flex-wrap items-center justify-between gap-2 text-[13px]"
            >
              <span className="text-neutral-300">
                {entry.previousStatus} → {entry.newStatus}
              </span>
              <span className="text-neutral-500 tabular-nums">
                {DATE_TIME.format(new Date(entry.timestamp))}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default function ProjectDetail({ job, onBack, onChangeApproval, history = [] }) {
  const isApproved = job.approvalStatus === 'Approved'

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <button
        onClick={onBack}
        className="flex w-fit items-center gap-1.5 rounded-full border border-white/10 px-3.5 py-1.5 text-sm text-neutral-300 transition-colors hover:border-white/20 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-green"
      >
        <ArrowLeft size={14} aria-hidden="true" />
        All projects
      </button>

      <div className="rounded-[18px] border border-white/[0.06] bg-[#11161c] p-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm text-neutral-500 tabular-nums">{job.jobId}</p>
            <h1 className="mt-1 text-3xl font-bold text-white">{job.client}</h1>
            <p className="mt-1 text-neutral-400">{job.category}</p>
          </div>
          <p className="text-3xl font-bold text-brand-green tabular-nums">
            {CURRENCY.format(job.value)}
          </p>
        </div>

        <div className="mt-7 grid grid-cols-1 gap-6 border-t border-white/10 pt-7 sm:grid-cols-2">
          <Field label="Assigned technician">{job.tech}</Field>
          <Field label="Created">{DATE.format(new Date(job.createdAt))}</Field>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-6 border-t border-white/10 pt-6 sm:grid-cols-2">
          <Field label="AI check status">
            <div className="flex flex-col gap-1.5">
              <StatusBadge label={job.aiStatus} />
              {job.aiReason && <p className="text-[13px] text-neutral-500">{job.aiReason}</p>}
            </div>
          </Field>

          <Field label="Approval status">
            <div className="flex flex-wrap items-center gap-3">
              <StatusBadge label={job.approvalStatus} />
              {onChangeApproval && (
                <button
                  onClick={() =>
                    onChangeApproval(job.jobId, job.approvalStatus, isApproved ? 'Pending' : 'Approved')
                  }
                  className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold transition-all duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-green ${
                    isApproved
                      ? 'border border-white/10 text-neutral-400 hover:border-white/20 hover:text-white'
                      : 'bg-brand-green text-brand-green-ink hover:-translate-y-0.5 hover:shadow-[0_4px_14px_rgba(56,184,106,0.25)]'
                  }`}
                >
                  {isApproved ? (
                    <>
                      <RotateCcw size={12} aria-hidden="true" />
                      Revert to pending
                    </>
                  ) : (
                    <>
                      <CheckCircle2 size={12} aria-hidden="true" />
                      Mark as approved
                    </>
                  )}
                </button>
              )}
            </div>
          </Field>
        </div>

        <History entries={history} />
      </div>
    </div>
  )
}
