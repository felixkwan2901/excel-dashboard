const DATE = new Intl.DateTimeFormat('en-NZ', { day: '2-digit', month: 'short' })

function relativeDate(isoDate, today = new Date()) {
  const days = Math.floor((today - new Date(isoDate)) / (1000 * 60 * 60 * 24))
  if (days <= 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 14) return `${days} days ago`
  return DATE.format(new Date(isoDate))
}

export default function RecentActivity({ jobs, limit = 5 }) {
  const recent = [...jobs]
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, limit)

  return (
    <div className="rounded-2xl border border-white/10 bg-[#11161c] p-7">
      <h2 className="mb-5 text-lg font-semibold text-white">Recent activity</h2>

      {recent.length === 0 && <p className="text-sm text-neutral-400">Nothing logged yet.</p>}

      <ul className="flex flex-col divide-y divide-white/10">
        {recent.map((job) => (
          <li key={job.jobId} className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-neutral-200">
                <span className="text-neutral-500">{job.jobId}</span> · {job.client}
              </p>
              <p className="truncate text-xs text-neutral-500">{job.category}</p>
            </div>
            <span className="shrink-0 text-xs text-neutral-500">{relativeDate(job.createdAt)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
