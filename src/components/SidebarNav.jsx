import { useState } from 'react'
import {
  BarChart3,
  CalendarClock,
  ChartColumn,
  ClipboardCheck,
  FolderKanban,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  RefreshCw,
  Receipt,
  Sun,
  Upload,
} from 'lucide-react'
import Logo from './Logo'
import SearchBar from './SearchBar'
import NotificationsBell from './NotificationsBell'
import WeatherWidget from './WeatherWidget'
import DateTimeWidget from './DateTimeWidget'
import { applySidebarCollapsed, applyTheme, readSidebarCollapsed } from '../lib/theme'

// The app's navigation: six destinations in a left column, with the
// glanceable widgets (search, clock, weather, alerts) in a strip above the
// content.
//
// Icons rather than plain labels because a vertical list of text is much
// harder to scan than a horizontal one — the eye has no shape to lock onto —
// and because they're what's left when the sidebar is collapsed to a rail.
const LINKS = [
  { view: 'main-sheet', label: 'Job checklist', icon: ClipboardCheck, handler: 'onGoMainSheet' },
  { view: 'dashboard', label: 'Projects', icon: FolderKanban, handler: 'onGoDashboard' },
  { view: 'monthly-claims', label: 'Monthly claims', icon: Receipt, handler: 'onGoMonthlyClaims' },
  { view: 'monthly-hours', label: 'Hours by month', icon: BarChart3, handler: 'onGoMonthlyHours' },
  { view: 'upcoming-work', label: 'Upcoming work', icon: CalendarClock, handler: 'onGoUpcomingWork' },
  { view: 'charts', label: 'Charts', icon: ChartColumn, handler: 'onGoCharts' },
  { view: 'update', label: 'Update data', icon: Upload, handler: 'onGoUpdateData' },
]

export function Sidebar({ view, onGoHome, ...handlers }) {
  const [collapsed, setCollapsed] = useState(readSidebarCollapsed)

  function toggleRail() {
    setCollapsed((prev) => applySidebarCollapsed(!prev))
  }

  return (
    <aside className="side-nav" aria-label="Primary">
      <button className="side-nav__brand" onClick={onGoHome} title="Operations overview">
        <Logo size={26} />
        <span>Cassidy-Davies</span>
      </button>
      {LINKS.map(({ view: v, label, icon: Icon, handler }) => (
        <button
          key={v}
          className={`side-nav__link ${view === v ? 'is-active' : ''}`}
          onClick={handlers[handler]}
          aria-current={view === v ? 'page' : undefined}
          // The title carries the label when it's a rail and the icon is all
          // that's left on screen.
          title={label}
        >
          <Icon size={15} aria-hidden="true" />
          <span className="side-nav__label">{label}</span>
        </button>
      ))}
      <div className="side-nav__spacer" />
      <button
        type="button"
        className="side-nav__rail-toggle"
        onClick={toggleRail}
        aria-expanded={!collapsed}
        title={collapsed ? 'Expand sidebar' : 'Collapse sidebar to icons'}
      >
        {collapsed ? (
          <PanelLeftOpen size={15} aria-hidden="true" />
        ) : (
          <PanelLeftClose size={15} aria-hidden="true" />
        )}
        <span className="side-nav__label">Collapse</span>
      </button>
    </aside>
  )
}

// Light or dark. Sits with the clock and the weather because it belongs with
// the other things about this browser rather than about the business.
function ThemeToggle({ theme, onChange }) {
  const next = theme === 'dark' ? 'light' : 'dark'
  return (
    <button
      type="button"
      onClick={() => onChange(applyTheme(next))}
      title={next === 'dark' ? 'Switch to dark' : 'Switch to light'}
      aria-label={next === 'dark' ? 'Switch to dark' : 'Switch to light'}
      className="flex items-center justify-center rounded-lg border border-white/[0.06] bg-white/[0.03] p-2 text-neutral-400 transition-colors hover:border-white/20 hover:text-white"
    >
      {theme === 'dark' ? (
        <Sun size={14} aria-hidden="true" />
      ) : (
        <Moon size={14} aria-hidden="true" />
      )}
    </button>
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
  theme,
  onThemeChange,
}) {
  return (
    <div className="top-strip">
      <SearchBar value={searchValue} onChange={onSearchChange} onSubmit={onSearchSubmit} />
      <div className="ml-auto flex items-center gap-3">
        <DateTimeWidget />
        <WeatherWidget />
        <ThemeToggle theme={theme} onChange={onThemeChange} />
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
