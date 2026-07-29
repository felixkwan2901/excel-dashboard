import { useEffect, useState } from 'react'
import { loadWorkbook } from './lib/loadWorkbook'
import { computeKpis, computeSwimlaneStats } from './lib/deriveMetrics'
import StatTile from './components/StatTile'
import SwimlaneChart from './components/SwimlaneChart'
import SwimlaneTable from './components/SwimlaneTable'
import JobTable from './components/JobTable'
import SwimlaneReference from './components/SwimlaneReference'
import './App.css'

export default function App() {
  const [state, setState] = useState({ status: 'loading' })

  useEffect(() => {
    loadWorkbook()
      .then(({ jobs, swimlaneReference }) => {
        setState({ status: 'ready', jobs, swimlaneReference })
      })
      .catch((error) => {
        setState({ status: 'error', error })
      })
  }, [])

  if (state.status === 'loading') {
    return (
      <div className="app-status">
        <p>Loading workbook…</p>
      </div>
    )
  }

  if (state.status === 'error') {
    return (
      <div className="app-status">
        <p>Couldn&apos;t load the workbook: {String(state.error?.message ?? state.error)}</p>
      </div>
    )
  }

  const { jobs, swimlaneReference } = state
  const kpis = computeKpis(jobs)
  const swimlaneStats = computeSwimlaneStats(jobs)

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <div>
          <h1>Cassidy-Davies Electrical</h1>
          <p>Operations &amp; workflow dashboard — BPMN swimlane tracking across active jobs.</p>
        </div>
      </header>

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

      <section className="panel">
        <h2>BPMN swimlane reference</h2>
        <SwimlaneReference data={swimlaneReference} />
      </section>
    </div>
  )
}
