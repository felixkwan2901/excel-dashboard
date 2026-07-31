import { AlertTriangle, Briefcase, Clock } from 'lucide-react'
import StatCard from './StatCard'
import WeatherWidget from './WeatherWidget'

export default function StatsRow({ kpis }) {
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      <StatCard icon={Briefcase} label="Active jobs" value={kpis.totalJobs} />
      <StatCard
        icon={Clock}
        label="Pending approval"
        value={kpis.pendingApproval}
        tone={kpis.pendingApproval > 0 ? 'warning' : 'neutral'}
      />
      <StatCard
        icon={AlertTriangle}
        label="Urgent tasks"
        value={kpis.urgentCount}
        tone={kpis.urgentCount > 0 ? 'critical' : 'neutral'}
      />
      <WeatherWidget />
    </div>
  )
}
