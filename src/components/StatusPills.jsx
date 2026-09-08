import { AlertTriangle, CircleCheck, Clock, TrendingDown, TrendingUp, User } from 'lucide-react'
import { percent } from '../lib/format'

// The row of state under a job's name: what condition it's in, which way it's
// moving, whose it is, and how current the figures are. All four read off data
// the app already has — nothing here is typed in and nothing can go stale
// without saying so.
//
// Deliberately not here: "Quote accepted" and "Invoice sent". Those live in
// Katipult, not in the workbook these exports come from, so a pill claiming
// them would be a guess that looks like a fact.
const TREND_STEADY = 0.005 // ±0.5 margin points reads as noise, not a real move

const TONES = {
  good: 'border-brand-green/40 bg-brand-green/10 text-brand-green',
  bad: 'border-red-400/40 bg-red-400/[0.08] text-red-400',
  warn: 'border-amber-400/40 bg-amber-400/[0.08] text-amber-400',
  neutral: 'border-white/10 bg-white/[0.03] text-neutral-300',
}

function Pill({ icon: Icon, tone = 'neutral', title, children }) {
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[12.5px] font-medium ${TONES[tone]}`}
    >
      {Icon && <Icon size={13} aria-hidden="true" />}
      {children}
    </span>
  )
}

// Condition first, because it's the one that decides whether you keep reading.
// A flagged job gets a pill per reason rather than one vague "Flagged": which
// of the two it is changes what you'd do about it.
function conditionPills(job) {
  const pills = []
  if (job.overBudget) {
    pills.push({ key: 'over', icon: AlertTriangle, tone: 'bad', label: 'Over budget' })
  }
  if (job.losingMargin) {
    pills.push({ key: 'margin', icon: AlertTriangle, tone: 'bad', label: 'Losing margin' })
  }
  if (pills.length === 0) {
    pills.push({ key: 'ok', icon: CircleCheck, tone: 'good', label: 'On track' })
  }
  return pills
}

function trendPill(marginTrend) {
  if (marginTrend === null) {
    return { icon: Clock, tone: 'neutral', label: 'Too early to trend', title: 'Needs two weeks of logged figures before a trend means anything' }
  }
  if (marginTrend > TREND_STEADY) {
    return { icon: TrendingUp, tone: 'good', label: `Improving ${percent(marginTrend)}` }
  }
  if (marginTrend < -TREND_STEADY) {
    return { icon: TrendingDown, tone: 'bad', label: `Worsening ${percent(marginTrend)}` }
  }
  return { icon: TrendingUp, tone: 'neutral', label: 'Steady margin' }
}

export default function StatusPills({ job, jobOwner }) {
  const trend = trendPill(job.marginTrend)

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      {conditionPills(job).map(({ key, icon, tone, label }) => (
        <Pill key={key} icon={icon} tone={tone}>
          {label}
        </Pill>
      ))}

      <Pill icon={trend.icon} tone={trend.tone} title={trend.title}>
        {trend.label}
      </Pill>

      {/* How current the figures are. A job several weeks behind isn't a job
          in trouble — it's a job nobody has exported — and reading the two as
          the same thing is how a stale number gets acted on. */}
      <Pill
        icon={Clock}
        tone={job.isStale ? 'warn' : 'neutral'}
        title={
          job.isStale
            ? `Last export has this job at ${job.lastUpdatedLabel} — these figures are ${job.weeksBehind} week${job.weeksBehind === 1 ? '' : 's'} old`
            : `Figures are current as at ${job.lastUpdatedLabel}`
        }
      >
        {job.isStale
          ? `${job.weeksBehind} week${job.weeksBehind === 1 ? '' : 's'} behind`
          : `Current · ${job.lastUpdatedLabel}`}
      </Pill>

      {jobOwner && (
        <Pill icon={User} title="Job owner, from the job checklist">
          {jobOwner}
        </Pill>
      )}
    </div>
  )
}
