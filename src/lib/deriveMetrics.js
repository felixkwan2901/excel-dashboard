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

  const overBudgetCount = jobs.filter((j) => j.overBudget).length
  const losingMarginCount = jobs.filter((j) => j.losingMargin).length
  const needsReviewCount = jobs.filter((j) => j.flagged).length

  return {
    activeJobs,
    totalQuotedValue,
    avgMargin,
    avgQuotedMargin,
    needsReviewCount,
    overBudgetCount,
    losingMarginCount,
  }
}
