import { useEffect, useRef, useState } from 'react'
import { Bell } from 'lucide-react'

export default function NotificationsBell({ urgentJobs, onSelectJob }) {
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
        aria-label={`Notifications: ${urgentJobs.length} urgent job${urgentJobs.length === 1 ? '' : 's'}`}
        aria-expanded={open}
        className="relative flex h-9 w-9 items-center justify-center rounded-lg border border-white/[0.08] text-neutral-300 transition-colors hover:border-white/20 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-500"
      >
        <Bell size={16} aria-hidden="true" />
        {urgentJobs.length > 0 && (
          <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold text-white">
            {urgentJobs.length}
          </span>
        )}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-20 mt-2 w-72 rounded-xl border border-white/[0.08] bg-[#111827] p-2 shadow-lg shadow-black/40"
        >
          <p className="px-2 py-1.5 text-xs font-semibold tracking-wide text-neutral-400 uppercase">
            Urgent jobs
          </p>
          {urgentJobs.length === 0 && (
            <p className="px-2 py-3 text-sm text-neutral-400">Nothing urgent right now.</p>
          )}
          {urgentJobs.map((job) => (
            <button
              key={job.jobId}
              role="menuitem"
              onClick={() => {
                onSelectJob(job)
                setOpen(false)
              }}
              className="flex w-full flex-col gap-0.5 rounded-lg px-2 py-2 text-left transition-colors hover:bg-white/[0.06]"
            >
              <span className="text-sm font-semibold text-white">{job.jobId}</span>
              <span className="text-xs text-neutral-400">
                {job.client} · {job.category}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
