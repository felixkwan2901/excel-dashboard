import { ChevronRight } from 'lucide-react'

const STATUS_STYLES = {
  Urgent: 'bg-red-500/10 text-red-400 border-red-500/20',
  'Needs approval': 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  'On track': 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
}

const DATE = new Intl.DateTimeFormat('en-NZ', { day: '2-digit', month: 'short' })

function initials(name) {
  const words = name.split(/\s+/).filter((w) => w.length > 1 && w !== '&')
  return words
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('')
}

export default function CompanyList({ companies, onSelect }) {
  if (companies.length === 0) {
    return (
      <div className="rounded-2xl border border-white/10 bg-[#111827] p-7 text-center text-sm text-neutral-400">
        No companies match this filter.
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {companies.map((company) => (
        <button
          key={company.name}
          onClick={() => onSelect(company.name)}
          className="group flex flex-col gap-5 rounded-2xl border border-white/10 bg-[#111827] p-7 text-left transition-all hover:-translate-y-[3px] hover:border-emerald-500/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-500"
        >
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-emerald-500/10 text-sm font-semibold text-emerald-400">
              {initials(company.name)}
            </span>
            <div className="min-w-0">
              <p className="truncate text-lg font-bold text-white">{company.name}</p>
              <p className="text-sm font-medium text-neutral-400">
                {company.jobCount} active projects
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span
              className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLES[company.status]}`}
            >
              {company.status}
            </span>
            <span className="text-xs text-neutral-500">
              Last activity {DATE.format(new Date(company.lastActivity))}
            </span>
          </div>

          <div className="mt-auto flex items-center justify-end gap-1 border-t border-white/10 pt-4 text-sm font-semibold text-emerald-400">
            View projects
            <ChevronRight
              size={14}
              className="transition-transform duration-200 group-hover:translate-x-1"
              aria-hidden="true"
            />
          </div>
        </button>
      ))}
    </div>
  )
}
