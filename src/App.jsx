import { useEffect, useMemo, useState } from 'react'
import { loadWorkbook } from './lib/loadWorkbook'
import { computeKpis, computeCategories, computeCompanies } from './lib/deriveMetrics'
import Nav from './components/Nav'
import StatsRow from './components/StatsRow'
import JobTable from './components/JobTable'
import CategoryGrid from './components/CategoryGrid'
import CompanyList from './components/CompanyList'
import RecentActivity from './components/RecentActivity'
import ProjectList from './components/ProjectList'
import ProjectDetail from './components/ProjectDetail'
import Reveal from './components/Reveal'
import './App.css'

const APPROVAL_OVERRIDES_KEY = 'cde-approval-overrides'

function loadApprovalOverrides() {
  try {
    return JSON.parse(localStorage.getItem(APPROVAL_OVERRIDES_KEY)) ?? {}
  } catch {
    return {}
  }
}

export default function App() {
  const [state, setState] = useState({ status: 'loading' })
  const [view, setView] = useState('home')
  const [selectedCategory, setSelectedCategory] = useState(null)
  const [selectedClient, setSelectedClient] = useState(null)
  const [selectedJobId, setSelectedJobId] = useState(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [dashboardQuery, setDashboardQuery] = useState('')
  const [companyFilter, setCompanyFilter] = useState('all')
  const [approvalOverrides, setApprovalOverrides] = useState(loadApprovalOverrides)

  useEffect(() => {
    loadWorkbook()
      .then(({ jobs }) => setState({ status: 'ready', jobs }))
      .catch((error) => setState({ status: 'error', error }))
  }, [])

  function setJobApproval(jobId, approvalStatus) {
    setApprovalOverrides((prev) => {
      const next = { ...prev, [jobId]: approvalStatus }
      localStorage.setItem(APPROVAL_OVERRIDES_KEY, JSON.stringify(next))
      return next
    })
  }

  const jobs = useMemo(() => {
    if (state.status !== 'ready') return []
    return state.jobs.map((job) =>
      approvalOverrides[job.jobId] ? { ...job, approvalStatus: approvalOverrides[job.jobId] } : job
    )
  }, [state, approvalOverrides])
  const kpis = state.status === 'ready' ? computeKpis(jobs) : null
  const categories = useMemo(() => computeCategories(jobs), [jobs])
  const urgentJobs = useMemo(() => jobs.filter((j) => j.aiStatus === 'Flagged'), [jobs])

  const categoryJobs = useMemo(
    () => jobs.filter((job) => job.serviceType === selectedCategory),
    [jobs, selectedCategory]
  )
  const companies = useMemo(() => computeCompanies(categoryJobs), [categoryJobs])

  const filteredCompanies = useMemo(() => {
    if (companyFilter === 'needsApproval') {
      return companies.filter((c) => c.status === 'Needs approval')
    }
    if (companyFilter === 'urgent') {
      return companies.filter((c) => c.status === 'Urgent')
    }
    if (companyFilter === 'recentlyUpdated') {
      const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000
      return companies.filter((c) => new Date(c.lastActivity).getTime() >= cutoff)
    }
    return companies
  }, [companies, companyFilter])

  const companyJobs = useMemo(
    () => categoryJobs.filter((job) => job.client === selectedClient),
    [categoryJobs, selectedClient]
  )

  const selectedJob = useMemo(
    () => jobs.find((job) => job.jobId === selectedJobId) ?? null,
    [jobs, selectedJobId]
  )

  function goHome() {
    setView('home')
  }

  function goDashboard() {
    setView('dashboard')
  }

  function openCategory(name) {
    setSelectedCategory(name)
    setCompanyFilter('all')
    setView('category')
  }

  function openCompany(name) {
    setSelectedClient(name)
    setView('company')
  }

  function openProject(jobId) {
    setSelectedJobId(jobId)
    setView('project')
  }

  function openUrgentJob(job) {
    setSelectedJobId(job.jobId)
    setSelectedClient(job.client)
    setSelectedCategory(job.serviceType)
    setView('project')
  }

  function submitSearch(e) {
    e.preventDefault()
    setDashboardQuery(searchQuery)
    setView('dashboard')
  }

  return (
    <div className="site">
      <Nav
        view={view}
        onGoHome={goHome}
        onGoDashboard={goDashboard}
        searchValue={searchQuery}
        onSearchChange={setSearchQuery}
        onSearchSubmit={submitSearch}
        urgentJobs={urgentJobs}
        onSelectUrgentJob={openUrgentJob}
      />

      {view === 'home' && (
        <main>
          <Reveal as="section" index={0} className="hero-photo">
            <div className="hero-photo__content">
              <div className="mx-auto w-full max-w-6xl">
                <div className="mb-10">
                  <h1 className="text-4xl leading-tight font-semibold tracking-tight text-white">
                    Operations Overview
                  </h1>
                  <p className="mt-3 max-w-md text-[15px] text-neutral-400">
                    Monitor active jobs, project status, and field operations in real time.
                  </p>
                </div>

                {kpis && (
                  <div className="mb-10">
                    <StatsRow kpis={kpis} />
                  </div>
                )}

                <div className="mb-6 flex items-center justify-between gap-3">
                  <h2 className="text-2xl font-medium text-white">Service categories</h2>
                  <button className="hero-photo__cta" onClick={goDashboard}>
                    View progress →
                  </button>
                </div>

                {state.status === 'loading' && <p className="dashboard__status">Loading jobs…</p>}
                {state.status === 'error' && (
                  <p className="dashboard__status">
                    Couldn&apos;t load the workbook: {String(state.error?.message ?? state.error)}
                  </p>
                )}
                {state.status === 'ready' && (
                  <CategoryGrid categories={categories} onSelect={openCategory} />
                )}
              </div>
            </div>
          </Reveal>

          <Reveal as="footer" index={1} className="site-footer">
            Cassidy-Davies Electrical — Christchurch, New Zealand · Registered Master
            Electricians
          </Reveal>
        </main>
      )}

      {view === 'category' && (
        <main className="mx-auto max-w-5xl px-5 py-8">
          <nav className="mb-4 flex items-center gap-1.5 text-sm text-text-muted">
            <button className="transition-colors hover:text-text-primary" onClick={goHome}>
              Service categories
            </button>
            <span aria-hidden="true">/</span>
            <span className="text-text-primary">{selectedCategory}</span>
          </nav>

          <Reveal index={0}>
            <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
              <div>
                <h1 className="text-2xl font-semibold text-text-primary">{selectedCategory}</h1>
                <p className="mt-1 text-sm text-text-secondary">
                  {(categories.find((c) => c.name === selectedCategory)?.jobCount ?? 0)} total
                  active jobs · {companies.length} clients
                </p>
              </div>
              <div className="flex gap-2">
                {categories.find((c) => c.name === selectedCategory)?.pendingCount > 0 && (
                  <span className="rounded-full border border-white/10 bg-white/[0.06] px-3 py-1 text-xs font-semibold text-neutral-300">
                    {categories.find((c) => c.name === selectedCategory).pendingCount} pending
                    approval
                  </span>
                )}
                {categories.find((c) => c.name === selectedCategory)?.urgentCount > 0 && (
                  <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-semibold text-white">
                    {categories.find((c) => c.name === selectedCategory).urgentCount} urgent
                  </span>
                )}
              </div>
            </div>

            <div className="mb-6 flex flex-wrap gap-2">
              {[
                { key: 'all', label: 'All' },
                { key: 'needsApproval', label: 'Needs Approval' },
                { key: 'urgent', label: 'Urgent' },
                { key: 'recentlyUpdated', label: 'Recently Updated' },
              ].map((chip) => (
                <button
                  key={chip.key}
                  onClick={() => setCompanyFilter(chip.key)}
                  className={`rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors ${
                    companyFilter === chip.key
                      ? 'border-brand-green/50 bg-brand-green/10 text-brand-green'
                      : 'border-white/10 text-neutral-400 hover:border-white/20 hover:text-white'
                  }`}
                >
                  {chip.label}
                </button>
              ))}
            </div>

            <CompanyList companies={filteredCompanies} onSelect={openCompany} />

            <div className="mt-8">
              <RecentActivity jobs={categoryJobs} />
            </div>
          </Reveal>
        </main>
      )}

      {view === 'company' && (
        <main className="dashboard">
          <button className="back-link" onClick={() => setView('category')}>
            ← {selectedCategory}
          </button>
          <Reveal index={0}>
            <h1 className="section-title">{selectedClient}</h1>
            <p className="section-subtitle">{companyJobs.length} projects on file</p>
            <ProjectList jobs={companyJobs} onSelect={openProject} showClient={false} />
          </Reveal>
        </main>
      )}

      {view === 'project' && selectedJob && (
        <main className="dashboard">
          <Reveal index={0}>
            <ProjectDetail
              job={selectedJob}
              onBack={() => setView('company')}
              onChangeApproval={setJobApproval}
            />
          </Reveal>
        </main>
      )}

      {view === 'dashboard' && (
        <main className="dashboard">
          <button className="back-link" onClick={goHome}>
            ← current projects
          </button>

          {state.status === 'loading' && <p className="dashboard__status">Loading workbook…</p>}
          {state.status === 'error' && (
            <p className="dashboard__status">
              Couldn&apos;t load the workbook: {String(state.error?.message ?? state.error)}
            </p>
          )}
          {state.status === 'ready' && (
            <Reveal as="section" index={0} className="panel">
              <h2>Job directory</h2>
              <JobTable jobs={jobs} initialQuery={dashboardQuery} />
            </Reveal>
          )}
        </main>
      )}
    </div>
  )
}
