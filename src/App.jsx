import { useEffect, useMemo, useState } from 'react'
import { loadWorkbook } from './lib/loadWorkbook'
import {
  computeKpis,
  computeSwimlaneStats,
  computeCategories,
  computeCompanies,
} from './lib/deriveMetrics'
import Nav from './components/Nav'
import StatsRow from './components/StatsRow'
import SwimlaneChart from './components/SwimlaneChart'
import SwimlaneTable from './components/SwimlaneTable'
import JobTable from './components/JobTable'
import CategoryGrid from './components/CategoryGrid'
import CompanyList from './components/CompanyList'
import ProjectList from './components/ProjectList'
import ProjectDetail from './components/ProjectDetail'
import Reveal from './components/Reveal'
import heroImage from './assets/hero-site-photo.jpg'
import './App.css'

export default function App() {
  const [state, setState] = useState({ status: 'loading' })
  const [view, setView] = useState('home')
  const [selectedCategory, setSelectedCategory] = useState(null)
  const [selectedClient, setSelectedClient] = useState(null)
  const [selectedJobId, setSelectedJobId] = useState(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [dashboardQuery, setDashboardQuery] = useState('')

  useEffect(() => {
    loadWorkbook()
      .then(({ jobs }) => setState({ status: 'ready', jobs }))
      .catch((error) => setState({ status: 'error', error }))
  }, [])

  const jobs = state.status === 'ready' ? state.jobs : []
  const kpis = state.status === 'ready' ? computeKpis(jobs) : null
  const swimlaneStats = state.status === 'ready' ? computeSwimlaneStats(jobs) : null
  const categories = useMemo(() => computeCategories(jobs), [jobs])
  const urgentJobs = useMemo(() => jobs.filter((j) => j.aiStatus === 'Flagged'), [jobs])

  const categoryJobs = useMemo(
    () => jobs.filter((job) => job.serviceType === selectedCategory),
    [jobs, selectedCategory]
  )
  const companies = useMemo(() => computeCompanies(categoryJobs), [categoryJobs])

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
            <div
              className="hero-photo__bg"
              style={{ backgroundImage: `url(${heroImage})` }}
              aria-hidden="true"
            />
            <div className="hero-photo__content">
              <div className="mx-auto w-full max-w-6xl">
                {kpis && (
                  <div className="mb-10">
                    <StatsRow kpis={kpis} />
                  </div>
                )}

                <div className="mb-8 flex items-center justify-between gap-3">
                  <h2 className="text-lg font-semibold text-white">Service categories</h2>
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
                  <span className="rounded-full border border-amber-500/20 bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-400">
                    {categories.find((c) => c.name === selectedCategory).pendingCount} pending
                    approval
                  </span>
                )}
                {categories.find((c) => c.name === selectedCategory)?.urgentCount > 0 && (
                  <span className="rounded-full border border-red-500/20 bg-red-500/10 px-3 py-1 text-xs font-semibold text-red-400">
                    {categories.find((c) => c.name === selectedCategory).urgentCount} urgent
                  </span>
                )}
              </div>
            </div>

            <CompanyList companies={companies} onSelect={openCompany} />
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
            <ProjectDetail job={selectedJob} onBack={() => setView('company')} />
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
            <>
              <Reveal as="section" index={0} className="panel-grid">
                <div className="panel">
                  <h2>Active jobs by swimlane</h2>
                  <SwimlaneChart data={swimlaneStats} />
                </div>
                <div className="panel">
                  <h2>Swimlane SLA compliance</h2>
                  <SwimlaneTable data={swimlaneStats} />
                </div>
              </Reveal>

              <Reveal as="section" index={1} className="panel">
                <h2>Job directory</h2>
                <JobTable jobs={jobs} swimlanes={swimlaneStats} initialQuery={dashboardQuery} />
              </Reveal>
            </>
          )}
        </main>
      )}
    </div>
  )
}
