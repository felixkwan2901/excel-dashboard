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
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {companies.map((company) => (
        <button
          key={company.name}
          onClick={() => onSelect(company.name)}
          className="group rounded-xl border border-white/10 bg-neutral-900/80 p-5 text-left transition-all hover:-translate-y-0.5 hover:border-emerald-500/50 hover:bg-neutral-900"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-500/10 text-sm font-semibold text-emerald-400">
                {initials(company.name)}
              </span>
              <div>
                <p className="font-semibold text-text-primary">{company.name}</p>
                <p className="text-xs text-text-muted">{company.jobCount} active projects</p>
              </div>
            </div>
            <span
              className="text-text-muted transition-transform group-hover:translate-x-1 group-hover:text-emerald-400"
              aria-hidden="true"
            >
              →
            </span>
          </div>

          <div className="mt-4 flex items-center justify-between border-t border-white/10 pt-3">
            <span
              className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLES[company.status]}`}
            >
              {company.status}
            </span>
            <span className="text-xs text-text-muted">
              Last activity {DATE.format(new Date(company.lastActivity))}
            </span>
          </div>
        </button>
      ))}
    </div>
  )
}
