import { RefreshCw } from 'lucide-react'
import Logo from './Logo'
import SearchBar from './SearchBar'
import NotificationsBell from './NotificationsBell'
import WeatherWidget from './WeatherWidget'
import DateTimeWidget from './DateTimeWidget'

// A manual escape hatch for staleness the automatic checks (service-worker
// update polling, the build-id check in main.jsx) haven't caught yet — most
// often because they haven't had a chance to run at all, e.g. loading the
// page within seconds of a fresh deploy. Adds a cache-busting query param
// and does a real navigation (not history.pushState) so the browser AND
// GitHub Pages' CDN both treat it as a brand new URL neither has a cached
// response for, guaranteeing a genuinely fresh index.html/JS/data — a
// plain reload doesn't reliably do that within GitHub Pages' 10-minute
// cache window. The added param is harmless and self-cleaning: urlState.js
// only ever reads its own known keys, and the next in-app navigation
// rewrites the query string from scratch anyway.
function hardRefresh() {
  const url = new URL(window.location.href)
  url.searchParams.set('_r', Date.now())
  window.location.assign(url.toString())
}

export default function Nav({
  view,
  onGoHome,
  onGoDashboard,
  searchValue,
  onSearchChange,
  onSearchSubmit,
  flaggedJobs,
  onSelectFlaggedJob,
  onPrintReport,
  onGoUpdateData,
  onGoMonthlyClaims,
  onGoMonthlyHours,
  onGoMainSheet,
  onGoNotes,
}) {
  return (
    <header className="site-nav">
      <div className="flex items-center gap-7">
        <button className="site-nav__brand" onClick={onGoHome}>
          <Logo size={28} />
          <span className="site-nav__brand-text">Cassidy-Davies Electrical</span>
        </button>

        <nav className="flex items-center gap-1" aria-label="Primary">
          <button
            className={`site-nav__link ${view === 'home' ? 'is-active' : ''}`}
            onClick={onGoHome}
          >
            Dashboard
          </button>
          <button
            className={`site-nav__link ${view === 'dashboard' ? 'is-active' : ''}`}
            onClick={onGoDashboard}
          >
            Projects
          </button>
          <button
            className={`site-nav__link ${view === 'monthly-claims' ? 'is-active' : ''}`}
            onClick={onGoMonthlyClaims}
          >
            Monthly claims
          </button>
          <button
            className={`site-nav__link ${view === 'monthly-hours' ? 'is-active' : ''}`}
            onClick={onGoMonthlyHours}
          >
            Hours by month
          </button>
          <button
            className={`site-nav__link ${view === 'main-sheet' ? 'is-active' : ''}`}
            onClick={onGoMainSheet}
          >
            Job checklist
          </button>
          <button
            className={`site-nav__link ${view === 'notes' ? 'is-active' : ''}`}
            onClick={onGoNotes}
          >
            Notes
          </button>
          <button
            className={`site-nav__link ${view === 'update' ? 'is-active' : ''}`}
            onClick={onGoUpdateData}
          >
            Update data
          </button>
        </nav>
      </div>

      <div className="ml-auto flex items-center gap-3">
        <SearchBar value={searchValue} onChange={onSearchChange} onSubmit={onSearchSubmit} />
        <DateTimeWidget />
        <WeatherWidget />
        <button
          type="button"
          onClick={hardRefresh}
          title="Refresh — fetches the latest version and data"
          aria-label="Refresh"
          className="flex items-center justify-center rounded-lg border border-white/[0.06] bg-white/[0.03] p-2 text-neutral-500 transition-colors hover:border-white/20 hover:text-white"
        >
          <RefreshCw size={14} aria-hidden="true" />
        </button>
        <NotificationsBell
          flaggedJobs={flaggedJobs}
          onSelectJob={onSelectFlaggedJob}
          onPrintReport={onPrintReport}
        />
      </div>
    </header>
  )
}
