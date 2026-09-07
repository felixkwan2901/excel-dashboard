// The pipeline runs on GitHub's runners, which are UTC. The business is in
// New Zealand, UTC+12/+13 — so every upload made before noon NZ is dated the
// *previous day* by the runner.
//
// That was writing figures into the wrong week slot. An upload at 08:55 on
// Tue 8 Sep NZ is 20:55 on Mon 7 Sep UTC, so the runner computed calendar
// Week 1 while the dashboard (running in the browser, on NZ time) checked
// staleness against Week 2. Every job read as "1 week behind" the moment it
// was successfully uploaded. It only shifts the week when the two dates fall
// either side of a boundary — the 8th, 15th, 22nd and 29th — which is why it
// looked intermittent.
//
// Anything deciding "which week" or "which month" must use this, not
// `new Date()`.
const BUSINESS_TZ = 'Pacific/Auckland'

// A Date whose *local* getters (getFullYear/getMonth/getDate/getHours) read
// as the New Zealand wall clock. Deliberately not a real instant — do not
// call toISOString() on it; use businessDateString() for a printable date.
export function businessNow(instant = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: BUSINESS_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(instant)
  const get = (type) => Number(parts.find((p) => p.type === type).value)
  // Some locales render midnight as hour 24; normalise so it stays in range.
  return new Date(get('year'), get('month') - 1, get('day'), get('hour') % 24, get('minute'), get('second'))
}

// YYYY-MM-DD for the New Zealand calendar day. Built from the local parts
// rather than toISOString(), which would convert back to UTC and undo the
// whole point.
export function businessDateString(date = businessNow()) {
  const pad = (n) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}
