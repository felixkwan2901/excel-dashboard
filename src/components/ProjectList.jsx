import StatusBadge from './StatusBadge'

const CURRENCY = new Intl.NumberFormat('en-NZ', {
  style: 'currency',
  currency: 'NZD',
  maximumFractionDigits: 0,
})

const DATE = new Intl.DateTimeFormat('en-NZ', { day: '2-digit', month: 'short' })

export default function ProjectList({ jobs, onSelect, showClient = true }) {
  return (
    <ul className="project-list">
      {jobs.map((job) => (
        <li key={job.jobId}>
          <button className="project-row" onClick={() => onSelect(job.jobId)}>
            <span className="project-row__id">
              {job.jobId}
              {!showClient && <span className="project-row__date"> · started {DATE.format(new Date(job.createdAt))}</span>}
            </span>
            <span className="project-row__main">
              {showClient && <span className="project-row__client">{job.client}</span>}
              <span className={showClient ? 'project-row__category' : 'project-row__client'}>
                {job.category}
              </span>
            </span>
            <span className="project-row__stage">{job.swimlane.replace(/^\d+\.\s*/, '')}</span>
            <span className="project-row__badges">
              <StatusBadge label={job.aiStatus} />
              <StatusBadge label={job.approvalStatus} />
            </span>
            <span className="project-row__value tabular">{CURRENCY.format(job.value)}</span>
            <span className="project-row__arrow" aria-hidden="true">
              →
            </span>
          </button>
        </li>
      ))}
    </ul>
  )
}
