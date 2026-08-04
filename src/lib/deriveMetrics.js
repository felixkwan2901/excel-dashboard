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
