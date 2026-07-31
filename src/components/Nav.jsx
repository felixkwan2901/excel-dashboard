import Logo from './Logo'
import SearchBar from './SearchBar'
import NotificationsBell from './NotificationsBell'

export default function Nav({
  view,
  onGoHome,
  onGoDashboard,
  searchValue,
  onSearchChange,
  onSearchSubmit,
  urgentJobs,
  onSelectUrgentJob,
}) {
  return (
    <header className="site-nav">
      <button className="site-nav__brand" onClick={onGoHome}>
        <Logo size={28} />
        <span className="site-nav__brand-text">Cassidy-Davies Electrical</span>
      </button>

      <nav className="flex items-center gap-1" aria-label="Primary">
        <button
          className={`site-nav__link ${view === 'dashboard' ? 'is-active' : ''}`}
          onClick={onGoDashboard}
        >
          Dashboard
        </button>
        <button
          className={`site-nav__link ${view === 'home' ? 'is-active' : ''}`}
          onClick={onGoHome}
        >
          Projects
        </button>
      </nav>

      <div className="ml-auto flex items-center gap-3">
        <SearchBar value={searchValue} onChange={onSearchChange} onSubmit={onSearchSubmit} />
        <NotificationsBell urgentJobs={urgentJobs} onSelectJob={onSelectUrgentJob} />
      </div>
    </header>
  )
}
