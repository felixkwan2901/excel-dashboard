import { useEffect, useState } from 'react'
import {
  BarChart3,
  Briefcase,
  CalendarClock,
  ChevronRight,
  Database,
  LayoutDashboard,
  ChartColumn,
  CheckCircle2,
  ClipboardCheck,
  ExternalLink,
  FolderKanban,
  HardHat,
  LogOut,
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
import { FIELD_APP_URL } from '../lib/links'
import { UPLOAD_WORKER_URL } from '../lib/workerClient'

// The app's navigation: a left column of destinations, with the
// glanceable widgets (search, clock, weather, alerts) in a strip above the
// content.
//
// Icons rather than plain labels because a vertical list of text is much
// harder to scan than a horizontal one — the eye has no shape to lock onto —
// and because they're what's left when the sidebar is collapsed to a rail.
// The view key stays 'charts'. 'dashboard' is already taken — it is the
// default view, the one labelled "Projects" — so reusing it here would send
// every visit to the wrong screen.
// Three groups, each opening to its tabs. The group holding the page you're on
// is always open; the others open and close with a click (remembered). On a
// collapsed rail or a phone the group headings drop out and every tab shows as
// before, since there's no room for a heading to say anything.
const NAV_GROUPS = [
  {
    key: 'overview', label: 'Overview', icon: LayoutDashboard,
    links: [
      { view: 'charts', label: 'Dashboard', icon: ChartColumn, handler: 'onGoCharts' },
      { view: 'dashboard', label: 'Projects', icon: FolderKanban, handler: 'onGoDashboard', also: ['project', 'review'] },
      { view: 'upcoming-work', label: 'Upcoming work', icon: CalendarClock, handler: 'onGoUpcomingWork' },
    ],
  },
  {
    key: 'jobs', label: 'Jobs', icon: Briefcase,
    links: [
      { view: 'main-sheet', label: 'Job checklist', icon: ClipboardCheck, handler: 'onGoMainSheet', also: ['weekly-check-sheet', 'job-completion-checklist'] },
      { view: 'monthly-claims', label: 'Monthly claims', icon: Receipt, handler: 'onGoMonthlyClaims' },
      { view: 'completed-jobs', label: 'Completed jobs', icon: CheckCircle2, handler: 'onGoCompletedJobs' },
      { view: 'completed-insights', label: 'Completed insights', icon: BarChart3, handler: 'onGoCompletedInsights' },
    ],
  },
  {
    key: 'data', label: 'Data', icon: Database,
    links: [
      { view: 'update', label: 'Update data', icon: Upload, handler: 'onGoUpdateData' },
      { external: FIELD_APP_URL, label: 'Field app', icon: HardHat, title: 'Field app — on-site task progress (opens in a new tab)' },
    ],
  },
]
const OPEN_KEY = 'sidebar.openGroups'
function readOpenGroups() {
  try { return JSON.parse(localStorage.getItem(OPEN_KEY)) ?? [] } catch { return [] }
}

export function Sidebar({ view, onGoHome, ...handlers }) {
  const [collapsed, setCollapsed] = useState(readSidebarCollapsed)
  const [openGroups, setOpenGroups] = useState(readOpenGroups)
  function toggleGroup(key) {
    setOpenGroups((prev) => {
      const next = prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
      try { localStorage.setItem(OPEN_KEY, JSON.stringify(next)) } catch { /* not saved, still works */ }
      return next
    })
  }

  function toggleRail() {
    setCollapsed((prev) => applySidebarCollapsed(!prev))
  }

  // On a phone the nav is a sideways strip, and the page you're on can be off the
// end of it — so the active link is scrolled into view whenever the view changes.
  useEffect(() => {
    if (!window.matchMedia?.('(max-width: 860px)').matches) return
    document.querySelector('.side-nav__link.is-active')?.scrollIntoView({ inline: 'center', block: 'nearest' })
  }, [view])
  return (
    <aside className="side-nav" aria-label="Primary">
      <button className="side-nav__brand" onClick={onGoHome} title="Operations overview">
        <Logo size={26} />
        <span>Cassidy-Davies</span>
      </button>
      {NAV_GROUPS.map((g) => {
        const here = g.links.some((l) => l.view === view || l.also?.includes(view))
        const isOpen = here || openGroups.includes(g.key)
        const GIcon = g.icon
        return (
          <div key={g.key} className={`side-nav__group ${isOpen ? 'is-open' : ''}`}>
            <button
              type="button"
              className={`side-nav__group-head ${here ? 'is-here' : ''}`}
              onClick={() => toggleGroup(g.key)}
              aria-expanded={isOpen}
              title={g.label}
            >
              <GIcon size={15} aria-hidden="true" />
              <span className="side-nav__label">{g.label}</span>
              <ChevronRight size={13} aria-hidden="true" className="side-nav__chevron" />
            </button>
            <div className="side-nav__sub">
              {g.links.map((l) => {
                const Icon = l.icon
                if (l.external) {
                  // A separate app on a separate URL: a real link, opened in a new
                  // tab, and marked with an arrow so it never silently replaces
                  // the dashboard you were working in.
                  return (
                    <a key={l.label} href={l.external} target="_blank" rel="noreferrer" className="side-nav__link" title={l.title}>
                      <Icon size={15} aria-hidden="true" />
                      <span className="side-nav__label">
                        {l.label}
                        <ExternalLink size={12} aria-hidden="true" className="ml-1.5 inline align-[-1px] opacity-60" />
                      </span>
                    </a>
                  )
                }
                const active = view === l.view || l.also?.includes(view)
                return (
                  <button
                    key={l.view}
                    className={`side-nav__link ${active ? 'is-active' : ''}`}
                    onClick={handlers[l.handler]}
                    aria-current={active ? 'page' : undefined}
                    // The title carries the label when it's a rail and the icon is all
                    // that's left on screen.
                    title={l.label}
                  >
                    <Icon size={15} aria-hidden="true" />
                    <span className="side-nav__label">{l.label}</span>
                  </button>
                )
              })}
            </div>
          </div>
        )
      })}

      <div className="side-nav__spacer" />
      <AccountFooter />
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

// Who you are signed in as, and the way out.
//
// There was no way out at all before this: /auth/logout existed on the Worker
// and nothing in the app ever linked to it, so signing in was a one-way door
// and the only way to stop being signed in was to clear cookies. On a shared
// office computer that is the whole point of having a login.
//
// It renders nothing when /whoami does not answer, which is how the same
// bundle serves both builds — the GitHub Pages copy has no gate in front of
// it, so there is nobody to be signed in as and nothing to sign out of.
function AccountFooter() {
  const [user, setUser] = useState(null)

  useEffect(() => {
    let live = true
    // Plain fetch rather than workerFetch: a 401 here means "no login on this
    // build", which is an answer, not a problem, and must not trip the
    // signed-out reload.
    fetch(`${UPLOAD_WORKER_URL}/whoami`, { credentials: 'same-origin' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (live && d?.ok && d.user) setUser(d.user) })
      .catch(() => {})
    return () => { live = false }
  }, [])

  if (!user) return null

  return (
    <div className="side-nav__account">
      <p className="side-nav__account-name side-nav__label" title={`Signed in as ${user}`}>
        {user}
      </p>
      {/* A real link, not a fetch: signing out is the Worker clearing the
          cookie and redirecting, and doing it in JavaScript would leave the
          page holding data it is no longer entitled to. */}
      <a href="/auth/logout" className="side-nav__link" title={`Sign out of ${user}`}>
        <LogOut size={15} aria-hidden="true" />
        <span className="side-nav__label">Sign out</span>
      </a>
    </div>
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
  completedReviews,
  onSelectCompletedReview,
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
          completedReviews={completedReviews}
          onSelectCompletedReview={onSelectCompletedReview}
          onPrintReport={onPrintReport}
        />
      </div>
    </div>
  )
}
