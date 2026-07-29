import { useEffect, useMemo, useState } from 'react'
import { loadWorkbook } from './lib/loadWorkbook'
import {
  computeKpis,
  computeSwimlaneStats,
  computeCategories,
  computeCompanies,
} from './lib/deriveMetrics'
import Logo from './components/Logo'
import StatTile from './components/StatTile'
import SwimlaneChart from './components/SwimlaneChart'
import SwimlaneTable from './components/SwimlaneTable'
import JobTable from './components/JobTable'
import CategoryGrid from './components/CategoryGrid'
import CompanyList from './components/CompanyList'
import ProjectList from './components/ProjectList'
import ProjectDetail from './components/ProjectDetail'
import './App.css'

export default function App() {
  const [state, setState] = useState({ status: 'loading' })
  const [view, setView] = useState('home')
  const [selectedCategory, setSelectedCategory] = useState(null)
  const [selectedClient, setSelectedClient] = useState(null)
  const [selectedJobId, setSelectedJobId] = useState(null)

  useEffect(() => {
    loadWorkbook()
      .then(({ jobs }) => setState({ status: 'ready', jobs }))
      .catch((error) => setState({ status: 'error', error }))
  }, [])

  const jobs = state.status === 'ready' ? state.jobs : []
  const kpis = state.status === 'ready' ? computeKpis(jobs) : null
  const swimlaneStats = state.status === 'ready' ? computeSwimlaneStats(jobs) : null
  const categories = useMemo(() => computeCategories(jobs), [jobs])

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

  return (
    <div className="site">
      <header className="site-nav">
        <button className="site-nav__brand" onClick={() => setView('dashboard')}>
          <Logo />
          <span className="site-nav__brand-text">
            <span>cassidy-davies</span>
            <span>electrical</span>
          </span>
        </button>

        <button
          className={`site-nav__link ${view === 'home' ? 'is-active' : ''}`}
          onClick={goHome}
        >
          current projects
        </button>

        <div className="site-nav__group">
          <span className="site-nav__label">jobs</span>
          <span className="site-nav__value">{kpis ? kpis.totalJobs : '—'} active</span>
        </div>

        <div className="site-nav__group">
          <span className="site-nav__label">approvals</span>
          <span className="site-nav__value">{kpis ? kpis.pendingApproval : '—'} pending</span>
        </div>
      </header>

      {view === 'home' && (
        <main>
          <section className="projects-section">
            <div className="projects-section__header">
              <h2>Service categories</h2>
              {kpis && <span>{kpis.totalJobs} jobs in progress</span>}
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
          </section>

          <footer className="site-footer">
            Cassidy-Davies Electrical — Christchurch, New Zealand · Registered Master
            Electricians
          </footer>
        </main>
      )}

      {view === 'category' && (
        <main className="dashboard">
          <button className="back-link" onClick={goHome}>
            ← service categories
          </button>
          <h1 className="section-title">{selectedCategory}</h1>
          <p className="section-subtitle">{companies.length} companies with active jobs</p>
          <CompanyList companies={companies} onSelect={openCompany} />
        </main>
      )}

      {view === 'company' && (
        <main className="dashboard">
          <button className="back-link" onClick={() => setView('category')}>
            ← {selectedCategory}
          </button>
          <h1 className="section-title">{selectedClient}</h1>
          <p className="section-subtitle">{companyJobs.length} projects on file</p>
          <ProjectList jobs={companyJobs} onSelect={openProject} showClient={false} />
        </main>
      )}

      {view === 'project' && selectedJob && (
        <main className="dashboard">
          <ProjectDetail job={selectedJob} onBack={() => setView('company')} />
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
              <section className="stat-grid">
                <StatTile label="Total active jobs" value={kpis.totalJobs} />
                <StatTile label="AI validations passed" value={kpis.aiPassed} />
                <StatTile label="Pending manual approval" value={kpis.pendingApproval} />
                <StatTile label="Total revenue pipeline" value={kpis.pipelineValue} isCurrency />
              </section>

              <section className="panel-grid">
                <div className="panel">
                  <h2>Active jobs by swimlane</h2>
                  <SwimlaneChart data={swimlaneStats} />
                </div>
                <div className="panel">
                  <h2>Swimlane SLA compliance</h2>
                  <SwimlaneTable data={swimlaneStats} />
                </div>
              </section>

              <section className="panel">
                <h2>Job directory</h2>
                <JobTable jobs={jobs} swimlanes={swimlaneStats} />
              </section>
            </>
          )}
        </main>
      )}
    </div>
  )
}
