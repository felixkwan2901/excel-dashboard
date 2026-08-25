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
  return start.toISOString().slice(0, 10)
}
