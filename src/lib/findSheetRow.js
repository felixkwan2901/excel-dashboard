import XLSX from 'xlsx'

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
  const range = XLSX.utils.decode_range(ref)
  for (let r = range.s.r; r <= range.e.r; r += 1) {
    for (const c of labelColumns) {
      const v = sheet[XLSX.utils.encode_cell({ r, c })]?.v
      if (typeof v === 'string' && pattern.test(v.trim())) return r + 1
    }
  }
  return fallbackRow
}
