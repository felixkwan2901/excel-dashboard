// Weeks on the Weekly job check sheet run Saturday-to-Friday — the most
// recent Saturday on/before today is this week's start. Shared between
// WeeklyCheckSheetTab (which resets its own stored state against this) and
// MainSheetTab (which needs the same cutoff to judge whether a saved
// weekly-sheet completion is still current before treating item 18 as done).
export function currentWeekStart() {
  const now = new Date()
  const daysSinceSaturday = (now.getDay() + 1) % 7 // Saturday=6 -> 0, Sunday=0 -> 1, ...
  const start = new Date(now)
  start.setDate(now.getDate() - daysSinceSaturday)
  // Format from the local calendar parts, not toISOString(). The date above
  // is computed in local time, and toISOString() converts to UTC first — so
  // anywhere east of Greenwich (NZ is +12/+13) midnight local is still the
  // previous day in UTC, and this returned Friday's date for a week that
  // starts on Saturday. The week boundary itself was never wrong, but the
  // label was a day early, which is what the "Week of" field displayed.
  const pad = (n) => String(n).padStart(2, '0')
  return `${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}`
}

// True if a stored `weekOf` still counts as the current week.
//
// Use this rather than comparing against currentWeekStart() directly.
// Records written before the timezone fix above carry the Friday date
// (one day early), and a plain `>=` would read every one of them as last
// week's — silently blanking check sheets people had already filled in.
// Accepting the day before as well keeps those valid for the rest of this
// week; they get rewritten with the correct date on the next save.
//
// The shim can be deleted once no stored record predates the fix — any time
// after the week of 6 September 2026.
export function isCurrentWeek(weekOf) {
  if (!weekOf) return false
  const start = currentWeekStart()
  if (weekOf >= start) return true

  const legacy = new Date(`${start}T00:00:00`)
  legacy.setDate(legacy.getDate() - 1)
  const pad = (n) => String(n).padStart(2, '0')
  return weekOf === `${legacy.getFullYear()}-${pad(legacy.getMonth() + 1)}-${pad(legacy.getDate())}`
}
