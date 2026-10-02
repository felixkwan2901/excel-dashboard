// A1 addresses by hand rather than through the xlsx package, so this file
// doesn't pull the whole spreadsheet library into the page's first download.
const colNumber = (letters) => [...letters].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1
const colLetters = (c) => { let s = ''; for (let n = c + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s; return s }
const decodeCell = (a) => { const m = /^\$?([A-Z]+)\$?(\d+)$/.exec(a); return { c: colNumber(m[1]), r: Number(m[2]) - 1 } }
const decodeRange = (ref) => { const [s, e = s] = ref.split(':'); return { s: decodeCell(s), e: decodeCell(e) } }
const encodeCell = ({ r, c }) => `${colLetters(c)}${r + 1}`

// Find a sheet row by the label in its first few columns, rather than by a
// hard-coded row number.
//
// The Upcoming Work Calculator's capacity rows were addressed by number, and
// when a row was inserted above "Total Hours" every row below it shifted down
// by one. The numbers here didn't, so the parser quietly read the row above
// the one it wanted — "Staff on tools" displayed the working-days figures,
// and Hours available read a blank row. Nothing errored; it just showed the
// neighbouring row's data, which only someone who knows the business would
// catch.
//
// `fallbackRow` keeps the old behaviour if the label is ever reworded, so a
// renamed row degrades to the previous mapping instead of returning nothing.
export function findRowByLabel(sheet, pattern, fallbackRow, labelColumns = [0, 1, 2]) {
  const ref = sheet?.['!ref']
  if (!ref) return fallbackRow
  const range = decodeRange(ref)
  for (let r = range.s.r; r <= range.e.r; r += 1) {
    for (const c of labelColumns) {
      const v = sheet[encodeCell({ r, c })]?.v
      if (typeof v === 'string' && pattern.test(v.trim())) return r + 1
    }
  }
  return fallbackRow
}
