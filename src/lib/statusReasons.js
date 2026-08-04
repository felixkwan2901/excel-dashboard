import { money, percent } from './format'

export function statusReasons(job) {
  const reasons = []
  if (job.overBudget) {
    reasons.push(`Actual cost is ${money(job.totalActualCost - job.totalQuotedCost)} over quote`)
  }
  if (job.losingMargin) {
    reasons.push(`Margin is currently ${percent(job.marginToDate)}`)
  }
  return reasons
}
