import { AlertTriangle, Briefcase, Clock } from 'lucide-react'
import StatCard from './StatCard'

export default function StatsRow({ kpis }) {
  const pendingContext =
    kpis.pendingApproval > 0
      ? `Oldest waiting ${kpis.oldestPendingDays}d`
      : 'Nothing waiting'

  const urgentContext =
    kpis.urgentCount > 0
      ? `Across ${kpis.urgentCategoryCount} categor${kpis.urgentCategoryCount === 1 ? 'y' : 'ies'}`
      : 'Nothing flagged'

  return (
    <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
      <StatCard
        icon={Briefcase}
        label="Active Jobs"
        value={kpis.totalJobs}
        context={`${kpis.categoryCount} service categories`}
      />
      <StatCard
        icon={Clock}
        label="Pending Approval"
        value={kpis.pendingApproval}
        context={pendingContext}
        tone={kpis.pendingApproval > 0 ? 'critical' : 'neutral'}
      />
      <StatCard
        icon={AlertTriangle}
        label="Urgent Tasks"
        value={kpis.urgentCount}
        context={urgentContext}
        tone={kpis.urgentCount > 0 ? 'critical' : 'neutral'}
      />
    </div>
  )
}
