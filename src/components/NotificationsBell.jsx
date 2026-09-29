import { useEffect, useRef, useState } from 'react'
import { Bell } from 'lucide-react'

// completedReviews: completed quoted jobs that came in over quote
// ({ job, over: [{ label, quoted, actual, unit }] }), from src/lib/completedJobReview.js.
export default function NotificationsBell({ flaggedJobs, onSelectJob, onPrintReport, completedReviews = [], onSelectCompletedReview }) {
  const count = flaggedJobs.length + completedReviews.length
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    function onClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={`Notifications: ${count} job${count === 1 ? '' : 's'} need review`}
        aria-expanded={open}
        className="relative flex h-9 w-9 items-center justify-center rounded-lg border border-white/[0.08] text-neutral-300 transition-colors hover:border-white/20 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-green"
      >
        <Bell size={16} aria-hidden="true" />
        {count > 0 && (
          <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-white px-1 text-[10px] font-semibold text-[#12161c]">
            {count}
          </span>
        )}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-20 mt-2 max-h-[75vh] w-72 overflow-y-auto rounded-xl border border-white/[0.08] bg-[#11161c] p-2 shadow-lg shadow-black/40"
        >
          <p className="px-2 py-1.5 text-[13px] font-medium text-neutral-400">Needs review</p>
          {count === 0 && (
            <p className="px-2 py-3 text-sm text-neutral-400">Nothing flagged right now.</p>
          )}
          {flaggedJobs.map((job) => (
            <button
              key={job.jobNumber}
              role="menuitem"
              onClick={() => {
                onSelectJob(job)
                setOpen(false)
              }}
              className="flex w-full flex-col gap-0.5 rounded-lg px-2 py-2 text-left transition-colors hover:bg-white/[0.06]"
            >
              <span className="text-sm font-semibold text-white">Job {job.jobNumber}</span>
              <span className="text-xs text-neutral-400">{job.jobName}</span>
            </button>
          ))}
          {completedReviews.length > 0 && (
            <>
              <p className="mt-1 border-t border-white/[0.08] px-2 pb-1.5 pt-2.5 text-[13px] font-medium" style={{ color: 'var(--viz-critical)' }}>
                Completed jobs over quote
              </p>
              {completedReviews.map(({ job, over }) => (
                <button
                  key={`c-${job.jobNumber}`}
                  role="menuitem"
                  onClick={() => {
                    onSelectCompletedReview?.(job.jobNumber)
                    setOpen(false)
                  }}
                  className="flex w-full flex-col gap-0.5 rounded-lg px-2 py-2 text-left transition-colors hover:bg-white/[0.06]"
                >
                  <span className="text-sm font-semibold text-white">Job {job.jobNumber}</span>
                  <span className="text-xs text-neutral-400">{job.jobName}</span>
                  <span className="text-xs" style={{ color: 'var(--viz-critical)' }}>Over on {over.map((o) => o.label).join(', ')}</span>
                </button>
              ))}
            </>
          )}
          <button
            role="menuitem"
            onClick={() => {
              onPrintReport()
              setOpen(false)
            }}
            className="mt-1 w-full rounded-lg border-t border-white/[0.08] px-2 py-2 text-left text-sm font-medium text-brand-green transition-colors hover:bg-white/[0.06]"
          >
            Print full report →
          </button>
        </div>
      )}
    </div>
  )
}
