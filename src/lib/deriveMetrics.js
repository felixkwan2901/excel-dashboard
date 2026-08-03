const SWIMLANE_ORDER = [
  '1. Client / Portal',
  '2. Service Coordinator',
  '3. Central Knowledge Repository',
  '4. AI Validation Layer',
  '5. Electrical Technician',
  '6. Accounts & Billing',
]

// Cycle-time benchmarks aren't logged per job in the sheet; these are the
// operating targets Cassidy-Davies tracks per swimlane (from the Executive
// Summary tab), applied against the live job counts below.
const SWIMLANE_BENCHMARKS = {
  '1. Client / Portal': { avgCycleHrs: 1.5, targetSlaHrs: 2.0 },
  '2. Service Coordinator': { avgCycleHrs: 4.2, targetSlaHrs: 4.0 },
  '3. Central Knowledge Repository': { avgCycleHrs: 0.1, targetSlaHrs: 0.5 },
  '4. AI Validation Layer': { avgCycleHrs: 0.2, targetSlaHrs: 0.5 },
  '5. Electrical Technician': { avgCycleHrs: 18.5, targetSlaHrs: 24.0 },
  '6. Accounts & Billing': { avgCycleHrs: 8.0, targetSlaHrs: 12.0 },
}

const SERVICE_TYPE_ORDER = ['Commercial', 'Residential', 'Home Ventilation']

export function computeCategories(jobs) {
  return SERVICE_TYPE_ORDER.map((name) => {
    const categoryJobs = jobs.filter((j) => j.serviceType === name)
    const pendingCount = categoryJobs.filter((j) => j.approvalStatus === 'Pending').length
    const urgentCount = categoryJobs.filter((j) => j.aiStatus === 'Flagged').length
    const jobCount = categoryJobs.length
    const onTrackCount = jobCount - pendingCount - urgentCount
    const progressPercent = jobCount > 0 ? Math.round((onTrackCount / jobCount) * 100) : 100
    const lastActivity = categoryJobs.reduce(
      (latest, j) => (j.createdAt > latest ? j.createdAt : latest),
      categoryJobs[0]?.createdAt ?? ''
    )
    return {
      name,
      jobCount,
      pendingCount,
      urgentCount,
      progressPercent,
      lastActivity,
    }
  })
}

export function computeCompanies(jobs) {
  const order = []
  for (const job of jobs) {
    if (!order.includes(job.client)) order.push(job.client)
  }
  return order.map((name) => {
    const companyJobs = jobs.filter((j) => j.client === name)
    const pendingCount = companyJobs.filter((j) => j.approvalStatus === 'Pending').length
    const urgentCount = companyJobs.filter((j) => j.aiStatus === 'Flagged').length
    const lastActivity = companyJobs.reduce(
      (latest, j) => (j.createdAt > latest ? j.createdAt : latest),
      companyJobs[0].createdAt
    )
    const status = urgentCount > 0 ? 'Urgent' : pendingCount > 0 ? 'Needs approval' : 'On track'
    return {
      name,
      jobCount: companyJobs.length,
      pendingCount,
      urgentCount,
      lastActivity,
      status,
    }
  })
}

const MS_PER_DAY_KPI = 1000 * 60 * 60 * 24

export function computeKpis(jobs, today = new Date()) {
  const totalJobs = jobs.length
  const aiPassed = jobs.filter((j) => j.aiStatus === 'Passed').length
  const pendingJobs = jobs.filter((j) => j.approvalStatus === 'Pending')
  const pendingApproval = pendingJobs.length
  const pipelineValue = jobs.reduce((sum, j) => sum + j.value, 0)
  const urgentJobs = jobs.filter((j) => j.aiStatus === 'Flagged')
  const urgentCount = urgentJobs.length

  const categoryCount = new Set(jobs.map((j) => j.serviceType)).size
  const oldestPendingDays = pendingJobs.reduce((max, j) => {
    const days = Math.floor((today - new Date(j.createdAt)) / MS_PER_DAY_KPI)
    return Math.max(max, days)
  }, 0)
  const urgentCategoryCount = new Set(urgentJobs.map((j) => j.serviceType)).size

  return {
    totalJobs,
    aiPassed,
    pendingApproval,
    pipelineValue,
    urgentCount,
    categoryCount,
    oldestPendingDays,
    urgentCategoryCount,
  }
}

const MS_PER_DAY = 1000 * 60 * 60 * 24
const BILLING_STAGE = '6. Accounts & Billing'

// Two metrics defined from the data we actually have (no completion-event
// log or per-job progress % exists in the sheet):
//  - "completed this week" = jobs that reached the terminal billing stage
//    and were logged in the last 7 days — a proxy for "billed this week."
//  - "average completion" = the mean of each category's on-track ratio
//    (jobs with no open pending/urgent flag) — "how clean is the workload,"
//    not a per-job progress percentage.
export function computeGlobalStats(jobs, today = new Date()) {
  const completedThisWeek = jobs.filter((j) => {
    if (j.swimlane !== BILLING_STAGE) return false
    const days = (today - new Date(j.createdAt)) / MS_PER_DAY
    return days >= 0 && days <= 7
  }).length

  const categories = computeCategories(jobs)
  const averageCompletion = categories.length
    ? Math.round(categories.reduce((sum, c) => sum + c.progressPercent, 0) / categories.length)
    : 0

  return { completedThisWeek, averageCompletion }
}

export function computeSwimlaneStats(jobs) {
  return SWIMLANE_ORDER.map((name) => {
    const activeCount = jobs.filter((j) => j.swimlane === name).length
    const benchmark = SWIMLANE_BENCHMARKS[name]
    const compliance = benchmark.avgCycleHrs <= benchmark.targetSlaHrs
      ? 1 - (benchmark.avgCycleHrs / benchmark.targetSlaHrs - 1)
      : benchmark.targetSlaHrs / benchmark.avgCycleHrs
    return {
      name,
      shortName: name.replace(/^\d+\.\s*/, ''),
      activeCount,
      ...benchmark,
      compliance: Math.min(compliance, 1),
    }
  })
}
