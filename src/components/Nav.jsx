import Logo from './Logo'
import SearchBar from './SearchBar'
import NotificationsBell from './NotificationsBell'
import WeatherWidget from './WeatherWidget'

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
        </nav>
      </div>

      <div className="ml-auto flex items-center gap-3">
        <SearchBar value={searchValue} onChange={onSearchChange} onSubmit={onSearchSubmit} />
        <WeatherWidget />
        <NotificationsBell
          flaggedJobs={flaggedJobs}
          onSelectJob={onSelectFlaggedJob}
          onPrintReport={onPrintReport}
        />
      </div>
    </header>
  )
}
