import { useEffect, useMemo, useState } from 'react'
import { loadWorkbook } from './lib/loadWorkbook'
import { computeKpis } from './lib/deriveMetrics'
import { parseUrlState, pushUrlState, replaceUrlState } from './lib/urlState'
import Nav from './components/Nav'
import StatsRow from './components/StatsRow'
import JobTable from './components/JobTable'
import ProjectDetail from './components/ProjectDetail'
import ReviewReport from './components/ReviewReport'
import LastSynced from './components/LastSynced'
import Reveal from './components/Reveal'
import './App.css'

const initialNav = parseUrlState()

export default function App() {
  const [state, setState] = useState({ status: 'loading' })
  const [view, setView] = useState(initialNav.view)
  const [selectedJobId, setSelectedJobId] = useState(initialNav.selectedJobId)
  const [searchQuery, setSearchQuery] = useState('')
  const [dashboardQuery, setDashboardQuery] = useState(initialNav.dashboardQuery)
  const [dashboardFilter, setDashboardFilter] = useState(initialNav.dashboardFilter)

  useEffect(() => {
    loadWorkbook()
      .then(({ jobs }) => setState({ status: 'ready', jobs }))
      .catch((error) => setState({ status: 'error', error }))

    // Establish a well-formed history entry for the initial load (so a
    // later back-navigation to it has a real `.state` to restore from),
    // then listen for the browser's own back/forward buttons.
    replaceUrlState(initialNav)
    function onPopState(e) {
      const nav = e.state || parseUrlState()
      setView(nav.view)
      setSelectedJobId(nav.selectedJobId)
      setDashboardQuery(nav.dashboardQuery)
      setDashboardFilter(nav.dashboardFilter)
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  const jobs = state.status === 'ready' ? state.jobs : []
  const kpis = state.status === 'ready' ? computeKpis(jobs) : null
  const flaggedJobs = useMemo(() => jobs.filter((j) => j.flagged), [jobs])

  const selectedJob = useMemo(
    () => jobs.find((job) => job.jobNumber === selectedJobId) ?? null,
    [jobs, selectedJobId]
  )

  function goHome() {
    setView('home')
    pushUrlState({ view: 'home', selectedJobId: null, dashboardQuery, dashboardFilter })
  }

  function goDashboard(filterKey = 'all') {
    setDashboardFilter(filterKey)
    setView('dashboard')
    pushUrlState({
      view: 'dashboard',
      selectedJobId,
      dashboardQuery,
      dashboardFilter: filterKey,
    })
  }

  function openJob(job) {
    setSelectedJobId(job.jobNumber)
    setView('project')
    pushUrlState({
      view: 'project',
      selectedJobId: job.jobNumber,
      dashboardQuery,
      dashboardFilter,
    })
  }

  function goBack() {
    window.history.back()
  }

  function goReviewReport() {
    setView('review')
    pushUrlState({ view: 'review', selectedJobId, dashboardQuery, dashboardFilter })
  }

  function submitSearch(e) {
    e.preventDefault()
    setDashboardQuery(searchQuery)
    setView('dashboard')
    pushUrlState({
      view: 'dashboard',
      selectedJobId,
      dashboardQuery: searchQuery,
      dashboardFilter,
    })
  }

  function updateDashboardQuery(nextQuery) {
    setDashboardQuery(nextQuery)
    replaceUrlState({ view: 'dashboard', selectedJobId, dashboardQuery: nextQuery, dashboardFilter })
  }

  function updateDashboardFilter(nextFilter) {
    setDashboardFilter(nextFilter)
    replaceUrlState({
      view: 'dashboard',
      selectedJobId,
      dashboardQuery,
      dashboardFilter: nextFilter,
    })
  }

  return (
    <div className="site">
      <Nav
        view={view}
        onGoHome={goHome}
        onGoDashboard={() => goDashboard()}
        searchValue={searchQuery}
        onSearchChange={setSearchQuery}
        onSearchSubmit={submitSearch}
        flaggedJobs={flaggedJobs}
        onSelectFlaggedJob={openJob}
        onPrintReport={goReviewReport}
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
                    Monitor job costs, margins, and claim progress in real time.
                  </p>
                  <div className="mt-2">
                    <LastSynced />
                  </div>
                </div>

                {kpis && (
                  <div className="mb-10">
                    <StatsRow kpis={kpis} onSelectFilter={goDashboard} onPrintReport={goReviewReport} />
                  </div>
                )}

                <div className="mb-6 flex items-center justify-end gap-3">
                  <button className="hero-photo__cta" onClick={() => goDashboard()}>
                    View jobs →
                  </button>
                </div>

                {state.status === 'loading' && <p className="dashboard__status">Loading jobs…</p>}
                {state.status === 'error' && (
                  <p className="dashboard__status">
                    Couldn&apos;t load the workbook: {String(state.error?.message ?? state.error)}
                  </p>
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

      {view === 'project' && selectedJob && (
        <main className="dashboard">
          <Reveal index={0}>
            <ProjectDetail job={selectedJob} onBack={goBack} />
          </Reveal>
        </main>
      )}

      {view === 'review' && (
        <main className="dashboard">
          <Reveal index={0}>
            <ReviewReport jobs={flaggedJobs} onBack={goBack} />
          </Reveal>
        </main>
      )}

      {view === 'dashboard' && (
        <main className="dashboard">
          <nav className="flex items-center gap-1.5 text-sm text-text-muted">
            <button className="transition-colors hover:text-text-primary" onClick={goHome}>
              Operations Overview
            </button>
            <span aria-hidden="true">/</span>
            <span className="text-text-primary">Job Directory</span>
          </nav>

          {state.status === 'loading' && <p className="dashboard__status">Loading workbook…</p>}
          {state.status === 'error' && (
            <p className="dashboard__status">
              Couldn&apos;t load the workbook: {String(state.error?.message ?? state.error)}
            </p>
          )}
          {state.status === 'ready' && (
            <Reveal as="section" index={0} className="panel">
              <h2>Job directory</h2>
              <JobTable
                jobs={jobs}
                query={dashboardQuery}
                onQueryChange={updateDashboardQuery}
                statusFilter={dashboardFilter}
                onStatusFilterChange={updateDashboardFilter}
                onSelectJob={(jobNumber) => {
                  const job = jobs.find((j) => j.jobNumber === jobNumber)
                  if (job) openJob(job)
                }}
              />
            </Reveal>
          )}
        </main>
      )}
    </div>
  )
}
