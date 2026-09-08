// Light or dark, and how wide the sidebar is. Both are per-browser view
// preferences: they're remembered in localStorage, never leave the machine,
// and one person's choice can't change anyone else's screen.
//
// Light is the Katipolt-matching palette; dark is the theme the dashboard
// launched with. Neither is "the" design — people read screens differently,
// and the crew are on this in a bright office and in a van at night.
const THEME_KEY = 'theme'
const RAIL_KEY = 'sidebar-collapsed'
const THEMES = ['light', 'dark']

// No stored choice means follow the operating system, which is what someone
// who has set their laptop to dark at 5pm already expects to happen.
function systemTheme() {
  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  } catch {
    return 'light'
  }
}

export function readTheme() {
  let requested = null
  try {
    requested = new URL(window.location.href).searchParams.get('theme')
  } catch {
    // Malformed URL — fall through to the stored preference.
  }
  if (!THEMES.includes(requested)) requested = null

  try {
    if (requested) {
      localStorage.setItem(THEME_KEY, requested)
      return requested
    }
    const stored = localStorage.getItem(THEME_KEY)
    return THEMES.includes(stored) ? stored : systemTheme()
  } catch {
    return requested ?? systemTheme()
  }
}

// Written as an attribute on <html> so plain CSS can retheme everything,
// including the many components that hardcode their colours, without each of
// them needing to know a theme exists.
export function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme)
  // Keeps the browser's own scrollbars and form controls in step; without it
  // you get dark scrollbars on a white page.
  document.documentElement.style.colorScheme = theme
  try {
    localStorage.setItem(THEME_KEY, theme)
  } catch {
    // Preference won't stick, but the page is themed correctly right now.
  }
  return theme
}

export function readSidebarCollapsed() {
  try {
    return localStorage.getItem(RAIL_KEY) === '1'
  } catch {
    return false
  }
}

export function applySidebarCollapsed(collapsed) {
  document.documentElement.toggleAttribute('data-rail', collapsed)
  try {
    localStorage.setItem(RAIL_KEY, collapsed ? '1' : '0')
  } catch {
    // As above — a preference that won't persist, not a broken layout.
  }
  return collapsed
}
