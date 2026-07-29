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

export default function ProjectDetail({ job, onBack }) {
  return (
    <div className="project-detail">
      <button className="back-link" onClick={onBack}>
        ← all projects
      </button>

      <div className="project-detail__header">
        <div>
          <span className="project-detail__id">{job.jobId}</span>
          <h1>{job.client}</h1>
          <p>{job.category}</p>
        </div>
        <span className="project-detail__value">{CURRENCY.format(job.value)}</span>
      </div>

      <div className="project-detail__grid">
        <div className="project-detail__field">
          <span className="project-detail__label">Current swimlane</span>
          <span>{job.swimlane}</span>
        </div>
        <div className="project-detail__field">
          <span className="project-detail__label">Assigned technician</span>
          <span>{job.tech}</span>
        </div>
        <div className="project-detail__field">
          <span className="project-detail__label">Created</span>
          <span>{DATE.format(new Date(job.createdAt))}</span>
        </div>
        <div className="project-detail__field">
          <span className="project-detail__label">BPMN process ID</span>
          <span>{job.processId}</span>
        </div>
        <div className="project-detail__field">
          <span className="project-detail__label">AI check status</span>
          <StatusBadge label={job.aiStatus} />
        </div>
        <div className="project-detail__field">
          <span className="project-detail__label">Approval status</span>
          <StatusBadge label={job.approvalStatus} />
        </div>
      </div>
    </div>
  )
}
