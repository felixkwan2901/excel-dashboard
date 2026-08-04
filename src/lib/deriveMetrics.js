// Three distinct "average margin" figures are computed here, each
// answering a different question — keep them straight, since it's easy
// to accidentally mix them up (they will NOT match each other, by design):
//
//  - dollarWeightedAvgMargin: THE HEADLINE FIGURE shown on the Average
//    Margin stat card. Each job's margin is weighted by its actual cost,
//    so a $500k job moves this figure far more than a $5k job. This is
//    the one that best reflects overall portfolio health — a plain
//    per-job average lets one tiny job with a wild % swing (e.g. -298%
//    margin on a few thousand dollars) drag the headline down even
//    though it barely matters in dollar terms.
//  - avgMargin: a simple, unweighted mean of every job's margin-to-date —
//    every job counts equally regardless of size. Shown only as a
//    secondary comparison figure, never as the headline, because on its
//    own it's misleading for exactly the reason above.
//  - avgQuotedMargin: the same simple unweighted mean, but over each
//    job's originally quoted margin instead of its actual margin-to-date
//    — i.e. "what we expected" vs "what we're actually getting".
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
