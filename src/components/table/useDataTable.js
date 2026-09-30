import { useMemo, useState } from 'react'
import { useLocalStorageState } from '../../lib/useLocalStorageState'

// The state behind a DataTable — sort, which columns show, Simple/Full — kept
// in a hook so a page can read the sorted rows and the sort (for its phone
// cards and sort picker) without the table having to render them.
//
// Column shape (everything but `key` and `label` is optional):
//   key        row field, and the sort/hide/total key
//   label      header text (a page can change it per filter)
//   title      header tooltip
//   group      key into `groups`; consecutive columns of a group share a
//              two-row header, unless the group is `flat`
//   num        right-aligned, sorted high→low first (see numbersFirst)
//   text       sorted A→Z first even if it looks numeric
//   get(row)   the value (for sort, export and the default cell); else row[key]
//   fmt(v)     formats a non-null value for the cell and the totals row
//   render(row, ctx)  full control of the cell; `get` still feeds sort/export
//   export(row) value for the CSV instead of get/render
//   fmtTotal(v) formats the totals cell instead of fmt
//   sticky     frozen on the left; needs `width` (px)
//   stickyRight pinned to the right edge
//   width      px; also min/max for frozen columns
//   always     can't be hidden, and shows in Simple
//   sortable   default true; false for editable or badge columns
//   cellClass / cellStyle(row) / headClass
//   center     centred header
//
// Storage keys (all under `${id}.`): sort (only if persistSort), hiddenColumns,
// columnPreset. `migrateHidden(stored)` lets a page turn an old key's value
// into the first hiddenColumns list, once.
export function useDataTable({
  id,
  columns,
  rows,
  defaultSort = { key: null, dir: 1 },
  numbersFirst = 'asc',        // 'desc': a numeric column starts high→low
  persistSort = false,
  simpleKeys = null,           // array/Set → Simple/Full presets on
  defaultPreset = 'simple',
  defaultHidden = [],
  sortValue: sortValueOverride, // (row, col) => value, for keys the page owns
}) {
  const [sortState, setSortState] = useLocalStorageState(`${id}.sort`, defaultSort)
  const [sortLocal, setSortLocal] = useState(defaultSort)
  const [sort, setSort] = persistSort ? [sortState, setSortState] : [sortLocal, setSortLocal]
  const [hidden, setHidden] = useLocalStorageState(`${id}.hiddenColumns`, defaultHidden)
  const [preset, setPreset] = useLocalStorageState(`${id}.columnPreset`, simpleKeys ? defaultPreset : 'full')

  const simple = useMemo(() => (simpleKeys ? new Set(simpleKeys) : null), [simpleKeys])
  const hiddenSet = useMemo(() => new Set(hidden), [hidden])
  const visibleCols = useMemo(() => columns.filter((c) => c.always || (preset === 'simple' && simple ? simple.has(c.key) : !hiddenSet.has(c.key))), [columns, preset, simple, hiddenSet])

  const toggleColumn = (key) => {
    setPreset('full')
    setHidden((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]))
  }
  // Group toggle: hide all of the group's columns, or show all of them.
  const toggleGroup = (keys) => {
    setPreset('full')
    setHidden((prev) => {
      const allHidden = keys.every((k) => prev.includes(k))
      return allHidden ? prev.filter((k) => !keys.includes(k)) : [...new Set([...prev, ...keys])]
    })
  }

  const colByKey = useMemo(() => new Map(columns.map((c) => [c.key, c])), [columns])
  function toggleSort(key) {
    const col = colByKey.get(key)
    setSort((prev) => {
      if (prev.key === key) return { key, dir: -prev.dir }
      const desc = col?.num && !col?.text && numbersFirst === 'desc'
      return { key, dir: desc ? -1 : 1 }
    })
  }

  const sortedRows = useMemo(() => {
    const col = colByKey.get(sort.key)
    if (!sort.key) return rows
    const value = (r) => (sortValueOverride?.(r, col ?? { key: sort.key }) ?? (col?.get ? col.get(r) : r[sort.key]))
    const blank = (v) => v === null || v === undefined || v === ''
    return [...rows].sort((a, b) => {
      const av = value(a), bv = value(b)
      if (blank(av) || blank(bv)) return blank(av) - blank(bv) // blanks always last
      if (typeof av === 'string' || typeof bv === 'string') return String(av).localeCompare(String(bv)) * sort.dir
      return (av - bv) * sort.dir
    })
  }, [rows, sort, colByKey, sortValueOverride])

  return {
    id, columns, visibleCols, rows: sortedRows,
    sort, setSort, toggleSort,
    hidden: hiddenSet, toggleColumn, toggleGroup, setHidden,
    preset, setPreset, hasPresets: !!simple,
  }
}
