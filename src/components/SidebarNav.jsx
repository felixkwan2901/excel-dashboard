import {
  BarChart3,
  CalendarClock,
  ClipboardCheck,
  FolderKanban,
  RefreshCw,
  Receipt,
  Upload,
} from 'lucide-react'
import Logo from './Logo'
import SearchBar from './SearchBar'
import NotificationsBell from './NotificationsBell'
import WeatherWidget from './WeatherWidget'
import DateTimeWidget from './DateTimeWidget'

// The Katipolt-preview navigation: the same six destinations as the top nav
// in Nav.jsx, moved into a left column, with the glanceable widgets (search,
// clock, weather, alerts) kept in a strip above the content.
//
// Only rendered under ?skin=katipolt — see src/lib/skin.js. It deliberately
// takes the identical props to Nav so the two are interchangeable and neither
// App.jsx nor any screen needs to know which one is showing.
//
// Icons are here rather than in the top nav because a vertical list of plain
// text labels is much harder to scan than a horizontal one — the eye has no
// shape to lock onto.
const LINKS = [
  { view: 'main-sheet', label: 'Job checklist', icon: ClipboardCheck, handler: 'onGoMainSheet' },
  { view: 'dashboard', label: 'Projects', icon: FolderKanban, handler: 'onGoDashboard' },
  { view: 'monthly-claims', label: 'Monthly claims', icon: Receipt, handler: 'onGoMonthlyClaims' },
  { view: 'monthly-hours', label: 'Hours by month', icon: BarChart3, handler: 'onGoMonthlyHours' },
  { view: 'upcoming-work', label: 'Upcoming work', icon: CalendarClock, handler: 'onGoUpcomingWork' },
  { view: 'update', label: 'Update data', icon: Upload, handler: 'onGoUpdateData' },
]

export function Sidebar({ view, onGoHome, ...handlers }) {
  return (
    <aside className="side-nav" aria-label="Primary">
      <button className="side-nav__brand" onClick={onGoHome}>
        <Logo size={26} />
        <span>Cassidy-Davies</span>
      </button>
      {LINKS.map(({ view: v, label, icon: Icon, handler }) => (
        <button
          key={v}
          className={`side-nav__link ${view === v ? 'is-active' : ''}`}
          onClick={handlers[handler]}
          aria-current={view === v ? 'page' : undefined}
        >
          <Icon size={15} aria-hidden="true" />
          {label}
        </button>
      ))}
      <div className="side-nav__spacer" />
    </aside>
  )
}

export function TopStrip({
  searchValue,
  onSearchChange,
  onSearchSubmit,
  flaggedJobs,
  onSelectFlaggedJob,
  onPrintReport,
  onRefresh,
}) {
  return (
    <div className="top-strip">
      <SearchBar value={searchValue} onChange={onSearchChange} onSubmit={onSearchSubmit} />
      <div className="ml-auto flex items-center gap-3">
        <DateTimeWidget />
        <WeatherWidget />
        <button
          type="button"
          onClick={onRefresh}
          title="Refresh — fetches the latest version and data"
          aria-label="Refresh"
          className="flex items-center justify-center rounded-lg border border-white/[0.06] bg-white/[0.03] p-2 text-neutral-400 transition-colors hover:border-white/20 hover:text-white"
        >
          <RefreshCw size={14} aria-hidden="true" />
        </button>
        <NotificationsBell
          flaggedJobs={flaggedJobs}
          onSelectJob={onSelectFlaggedJob}
          onPrintReport={onPrintReport}
        />
      </div>
    </div>
  )
}
