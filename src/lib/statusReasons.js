import { money, percent } from './format'

export function statusReasons(job) {
  const reasons = []
  // Always the actual figure now. The projected one used to be preferred when
  // it existed, which meant the reason given for flagging a job was sometimes
  // not the rule that flagged it.
  if (job.overBudget) {
    reasons.push(`Actual cost is ${money(job.totalActualCost - job.totalQuotedCost)} over quote`)
  }
  if (job.losingMargin) {
    reasons.push(`Margin is currently ${percent(job.marginToDate)}`)
  }
  return reasons
}
