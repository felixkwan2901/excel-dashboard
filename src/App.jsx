import { useEffect, useMemo, useState } from 'react'
import { loadWorkbook } from './lib/loadWorkbook'
import { computeKpis } from './lib/deriveMetrics'
import { parseUrlState, pushUrlState, replaceUrlState } from './lib/urlState'
import Nav from './components/Nav'
import StatsRow from './components/StatsRow'
import JobTable from './components/JobTable'
import ProjectDetail from './components/ProjectDetail'
import ReviewReport from './components/ReviewReport'
import UpdateData from './components/UpdateData'
import MonthlyClaims from './components/MonthlyClaims'
import MonthlyHours from './components/MonthlyHours'
import MainSheetTab from './components/MainSheetTab'
import ArchivedJobsPanel from './components/ArchivedJobsPanel'
import UpcomingWorkTab from './components/UpcomingWorkTab'
import WeeklyCheckSheetTab from './components/WeeklyCheckSheetTab'
import JobCompletionChecklistTab from './components/JobCompletionChecklistTab'
import LastSynced from './components/LastSynced'
import Reveal from './components/Reveal'
import './App.css'

const initialNav = parseUrlState()

// Every view needs to handle all three load states consistently — several
// previously just required `state.status === 'ready'` data implicitly (e.g.
// "project" required a truthy selectedJob) and rendered nothing at all
// otherwise, indistinguishable from a genuine crash.
function LoadStatus({ status, error, onRetry }) {
  if (status === 'loading') return <p className="dashboard__status">Loading workbook…</p>
  if (status === 'error') {
    return (
      <div className="dashboard__status flex flex-col items-start gap-3">
        <p>Couldn&apos;t load the workbook: {String(error?.message ?? error)}</p>
        <button
          onClick={onRetry}
          className="rounded-lg border border-white/10 px-3.5 py-1.5 text-sm text-neutral-300 transition-colors hover:border-white/20 hover:text-white"
        >
          Retry
        </button>
      </div>
    )
  }
  return null
}

export default function App() {
  const [state, setState] = useState({ status: 'loading' })
  const [view, setView] = useState(initialNav.view)
  const [selectedJobId, setSelectedJobId] = useState(initialNav.selectedJobId)
  const [searchQuery, setSearchQuery] = useState('')
  const [dashboardQuery, setDashboardQuery] = useState(initialNav.dashboardQuery)
  const [dashboardFilter, setDashboardFilter] = useState(initialNav.dashboardFilter)

  // Shared by the initial mount effect and the Retry button — the effect
  // relies on state already defaulting to 'loading' rather than setting it
  // itself (a synchronous setState at the top of an effect body is a
  // cascading-render footgun); the retry button resets it explicitly since
  // it's firing from an event handler, not mount.
  function fetchWorkbook() {
    loadWorkbook()
      .then(({ jobs, monthlyClaims, mainSheet, monthlyHours, monthlyClaimsHistory, upcomingWork, archivedJobs }) =>
        setState({
          status: 'ready',
          jobs,
          monthlyClaims,
          mainSheet,
          monthlyHours,
          monthlyClaimsHistory,
          upcomingWork,
          archivedJobs,
        })
      )
      .catch((error) => setState({ status: 'error', error }))
  }

  function retryLoad() {
    setState({ status: 'loading' })
    fetchWorkbook()
  }

  useEffect(() => {
    fetchWorkbook()

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
  const monthlyClaims = state.status === 'ready' ? state.monthlyClaims : { jobs: [], totals: [] }
  const mainSheet = state.status === 'ready' ? state.mainSheet : { jobs: [], columns: [] }
  const monthlyHours = state.status === 'ready' ? state.monthlyHours : { months: [], totalsByMonth: [], jobs: [] }
  const upcomingWork = state.status === 'ready' ? state.upcomingWork : { jobs: [] }
  const archivedJobs = state.status === 'ready' ? state.archivedJobs : []
  const kpis = state.status === 'ready' ? computeKpis(jobs) : null
  const flaggedJobs = useMemo(() => jobs.filter((j) => j.flagged), [jobs])

  const selectedJob = useMemo(
    () => jobs.find((job) => job.jobNumber === selectedJobId) ?? null,
    [jobs, selectedJobId]
  )

  // The separate hero/KPI "home" page was removed — its stats now live at
  // the top of the Job Directory itself, so anything that used to send
  // someone "back home" now lands there instead.
  function goHome() {
    goDashboard()
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

  function goUpdateData() {
    setView('update')
    pushUrlState({ view: 'update', selectedJobId, dashboardQuery, dashboardFilter })
  }

  function goMonthlyClaims() {
    setView('monthly-claims')
    pushUrlState({ view: 'monthly-claims', selectedJobId, dashboardQuery, dashboardFilter })
  }

  function goMonthlyHours() {
    setView('monthly-hours')
    pushUrlState({ view: 'monthly-hours', selectedJobId, dashboardQuery, dashboardFilter })
  }

  function goMainSheet() {
    setView('main-sheet')
    pushUrlState({ view: 'main-sheet', selectedJobId, dashboardQuery, dashboardFilter })
  }

  function goUpcomingWork() {
    setView('upcoming-work')
    pushUrlState({ view: 'upcoming-work', selectedJobId, dashboardQuery, dashboardFilter })
  }

  function goWeeklyCheckSheet(job) {
    setSelectedJobId(job.jobNumber)
    setView('weekly-check-sheet')
    pushUrlState({ view: 'weekly-check-sheet', selectedJobId: job.jobNumber, dashboardQuery, dashboardFilter })
  }

  function goJobCompletionChecklist(job) {
    setSelectedJobId(job.jobNumber)
    setView('job-completion-checklist')
    pushUrlState({ view: 'job-completion-checklist', selectedJobId: job.jobNumber, dashboardQuery, dashboardFilter })
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
        onGoUpdateData={goUpdateData}
        onGoMonthlyClaims={goMonthlyClaims}
        onGoMonthlyHours={goMonthlyHours}
        onGoMainSheet={goMainSheet}
        onGoUpcomingWork={goUpcomingWork}
      />

      {view === 'project' && (
        <main className="dashboard">
          {state.status !== 'ready' ? (
            <LoadStatus status={state.status} error={state.error} onRetry={retryLoad} />
          ) : selectedJob ? (
            <Reveal index={0}>
              <ProjectDetail job={selectedJob} onBack={goBack} />
            </Reveal>
          ) : (
            <p className="dashboard__status">That job couldn&apos;t be found.</p>
          )}
        </main>
      )}

      {view === 'review' && (
        <main className="dashboard">
          {state.status !== 'ready' ? (
            <LoadStatus status={state.status} error={state.error} onRetry={retryLoad} />
          ) : (
            <Reveal index={0}>
              <ReviewReport jobs={flaggedJobs} onBack={goBack} />
            </Reveal>
          )}
        </main>
      )}

      {view === 'update' && (
        <main className="dashboard">
          <Reveal index={0}>
            <UpdateData onBack={goHome} jobs={jobs} />
          </Reveal>
        </main>
      )}

      {view === 'monthly-claims' && (
        <main className="dashboard">
          {state.status !== 'ready' ? (
            <LoadStatus status={state.status} error={state.error} onRetry={retryLoad} />
          ) : (
            <Reveal index={0}>
              <MonthlyClaims monthlyClaims={monthlyClaims} jobs={jobs} monthlyHours={monthlyHours} onBack={goHome} />
            </Reveal>
          )}
        </main>
      )}

      {view === 'monthly-hours' && (
        <main className="dashboard">
          {state.status !== 'ready' ? (
            <LoadStatus status={state.status} error={state.error} onRetry={retryLoad} />
          ) : (
            <Reveal index={0}>
              <MonthlyHours monthlyHours={monthlyHours} jobs={jobs} onBack={goHome} />
            </Reveal>
          )}
        </main>
      )}

      {view === 'main-sheet' && (
        <main className="dashboard">
          {state.status !== 'ready' ? (
            <LoadStatus status={state.status} error={state.error} onRetry={retryLoad} />
          ) : (
            <Reveal index={0}>
              <MainSheetTab
                mainSheet={mainSheet}
                monthlyClaims={monthlyClaims}
                onBack={goHome}
                onOpenWeeklyCheckSheet={goWeeklyCheckSheet}
                onOpenJobCompletionChecklist={goJobCompletionChecklist}
              />
            </Reveal>
          )}
        </main>
      )}

      {view === 'upcoming-work' && (
        <main className="dashboard">
          {state.status !== 'ready' ? (
            <LoadStatus status={state.status} error={state.error} onRetry={retryLoad} />
          ) : (
            <Reveal index={0}>
              <UpcomingWorkTab upcomingWork={upcomingWork} onBack={goHome} />
            </Reveal>
          )}
        </main>
      )}

      {view === 'weekly-check-sheet' && (
        <main className="dashboard">
          {state.status !== 'ready' ? (
            <LoadStatus status={state.status} error={state.error} onRetry={retryLoad} />
          ) : selectedJob ? (
            <Reveal index={0}>
              <WeeklyCheckSheetTab job={selectedJob} onBack={goMainSheet} />
            </Reveal>
          ) : (
            <p className="dashboard__status">That job couldn&apos;t be found.</p>
          )}
        </main>
      )}

      {view === 'job-completion-checklist' && (
        <main className="dashboard">
          {state.status !== 'ready' ? (
            <LoadStatus status={state.status} error={state.error} onRetry={retryLoad} />
          ) : selectedJob ? (
            <Reveal index={0}>
              <JobCompletionChecklistTab job={selectedJob} onBack={goMainSheet} />
            </Reveal>
          ) : (
            <p className="dashboard__status">That job couldn&apos;t be found.</p>
          )}
        </main>
      )}

      {view === 'dashboard' && (
        <main className="dashboard">
          <div className="mb-2">
            <h1 className="text-2xl font-semibold text-white">Operations overview</h1>
            <div className="mt-1">
              <LastSynced />
            </div>
          </div>

          {kpis && (
            <div className="mb-2">
              <StatsRow kpis={kpis} onSelectFilter={goDashboard} onPrintReport={goReviewReport} />
            </div>
          )}

          <LoadStatus status={state.status} error={state.error} onRetry={retryLoad} />
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
          {state.status === 'ready' && (
            <div className="mt-4">
              <ArchivedJobsPanel archivedJobs={archivedJobs} />
            </div>
          )}
        </main>
      )}
    </div>
  )
}
