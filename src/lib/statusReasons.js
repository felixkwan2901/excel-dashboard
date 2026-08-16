import { money, percent } from './format'

export function statusReasons(job) {
  const reasons = []
  if (job.overBudget) {
    reasons.push(
      job.projectedOverrun !== null
        ? `At its current pace, this job is projected to finish ${money(job.projectedOverrun)} over quote`
        : `Actual cost is ${money(job.totalActualCost - job.totalQuotedCost)} over quote`
    )
  }
  if (job.losingMargin) {
    reasons.push(`Margin is currently ${percent(job.marginToDate)}`)
  }
  return reasons
}
