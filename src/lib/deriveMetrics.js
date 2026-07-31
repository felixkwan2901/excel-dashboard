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
    return {
      name,
      jobCount: categoryJobs.length,
      pendingCount: categoryJobs.filter((j) => j.approvalStatus === 'Pending').length,
      urgentCount: categoryJobs.filter((j) => j.aiStatus === 'Flagged').length,
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

export function computeKpis(jobs) {
  const totalJobs = jobs.length
  const aiPassed = jobs.filter((j) => j.aiStatus === 'Passed').length
  const pendingApproval = jobs.filter((j) => j.approvalStatus === 'Pending').length
  const pipelineValue = jobs.reduce((sum, j) => sum + j.value, 0)
  return { totalJobs, aiPassed, pendingApproval, pipelineValue }
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
