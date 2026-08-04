export function computeKpis(jobs) {
  const activeJobs = jobs.length
  const totalQuotedValue = jobs.reduce((sum, j) => sum + (j.quotedPrice ?? 0), 0)

  const validMargins = jobs.map((j) => j.marginToDate).filter((m) => m !== null)
  const avgMargin = validMargins.length
    ? validMargins.reduce((sum, m) => sum + m, 0) / validMargins.length
    : null

  const validQuotedMargins = jobs.map((j) => j.quotedMargin).filter((m) => m !== null)
  const avgQuotedMargin = validQuotedMargins.length
    ? validQuotedMargins.reduce((sum, m) => sum + m, 0) / validQuotedMargins.length
    : null

  // Dollar-weighted (by actual cost) rather than a plain per-job average —
  // a $500k job's margin should move this figure more than a $5k job's, so
  // one or two large jobs bleeding margin can't hide behind a healthy
  // average across a pile of small ones.
  const weightedJobs = jobs.filter((j) => j.marginToDate !== null && j.totalActualCost)
  const totalWeightedCost = weightedJobs.reduce((sum, j) => sum + j.totalActualCost, 0)
  const dollarWeightedAvgMargin = totalWeightedCost
    ? weightedJobs.reduce((sum, j) => sum + j.marginToDate * j.totalActualCost, 0) / totalWeightedCost
    : null

  const overBudgetCount = jobs.filter((j) => j.overBudget).length
  const losingMarginCount = jobs.filter((j) => j.losingMargin).length
  const needsReviewCount = jobs.filter((j) => j.flagged).length

  return {
    activeJobs,
    totalQuotedValue,
    avgMargin,
    avgQuotedMargin,
    dollarWeightedAvgMargin,
    needsReviewCount,
    overBudgetCount,
    losingMarginCount,
  }
}
