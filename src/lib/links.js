// Where the other app lives.
//
// One place, because it is referenced twice and the two are not equally
// forgiving: the sidebar link is a wrong click, but SiteQrCode prints a QR
// code that gets stuck on a job sheet and scanned on site. A stale URL there
// sends an electrician to a different copy of the app, writing progress the
// office is not reading, and nothing about that looks like an error.
//
// Build-time switch, same pattern as workerClient:
//
//   GitHub Pages (kwanfelix.me) — no variable set, so this stays the address
//     that copy has always pointed at.
//   Cloudflare (cd-dashboard)   — built with VITE_FIELD_APP_URL, so it points
//     at the field app's own Worker.
//
// Defaulting to the old address rather than to nothing: a build that forgets
// the variable produces a link to the previous app, which is wrong but
// working, instead of a dead one.
export const FIELD_APP_URL =
  import.meta.env.VITE_FIELD_APP_URL ?? 'https://www.kwanfelix.me/cde-field/'
