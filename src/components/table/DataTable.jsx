import { Fragment, useMemo, useState } from 'react'
import { Download } from 'lucide-react'
import { downloadCsv } from '../../lib/tableauExport'

// The one table. Frozen columns, two-row group headers, Simple/Full column
// presets with a picker, sorting, ticking rows with a pinned totals row,
// expandable rows, CSV export — so every page looks and behaves the same and a
// fix lands once. State comes from useDataTable (sort, visible columns), the
// page keeps the data and any per-page bits (filters, editing, phone cards).
//
// Props
//   table         from useDataTable
//   groups        [{ key, label, flat? }] for the two-row header
//   rowKey(row)   stable key; also the selection/expansion id
//   rowProps(row) → { className, style, title, id } merged onto the <tr>
//   onRowClick(row)
//   selectable, selected (Set), onSelectedChange(Set)
//   totals        { [colKey]: value } — rendered as a pinned foot row when given
//   expandable, expanded (Set), onToggleExpanded(key), renderDetail(row)
//   compact       tighter rows
//   emptyText
//   exportName    'completed-jobs' → an "Export CSV" button (visible columns, sorted rows)
//   toolbar       extra nodes on the toolbar's right; toolbarLeft on the left
//   hideToolbar
//   showOnMobile  the table (and toolbar) show below the sm breakpoint too, for pages with no card view
//   cellCtx       passed to column render(row, ctx)
export default function DataTable({
  table, groups = [], rowKey, rowProps, onRowClick,
  selectable = false, selected, onSelectedChange, totals,
  expandable = false, expanded, onToggleExpanded, renderDetail,
  compact = false, emptyText = 'Nothing to show.', exportName,
  toolbar, toolbarLeft, hideToolbar = false, showOnMobile = false, cellCtx, className = '',
}) {
  const { visibleCols, rows, sort, toggleSort } = table
  const [pickerOpen, setPickerOpen] = useState(false)

  // Frozen columns: left offsets add up from the widths of the frozen columns
  // before them; the last one carries the shadow edge.
  const stickyLeft = useMemo(() => {
    const map = new Map()
    let left = 0
    for (const c of visibleCols) if (c.sticky) { map.set(c.key, left); left += c.width ?? 120 }
    return map
  }, [visibleCols])
  const lastSticky = [...visibleCols].reverse().find((c) => c.sticky)?.key

  // Header row 1: ungrouped/flat columns span both rows; each run of a group spans its columns.
  const groupByKey = new Map(groups.map((g) => [g.key, g]))
  const headRow1 = []
  for (const c of visibleCols) {
    const g = c.group && groupByKey.get(c.group)
    if (!g || g.flat) headRow1.push({ col: c })
    else if (headRow1.at(-1)?.group !== g) headRow1.push({ group: g, span: 1 })
    else headRow1.at(-1).span += 1
  }
  const subCols = visibleCols.filter((c) => c.group && !groupByKey.get(c.group)?.flat)
  const twoRows = subCols.length > 0

  const stickyStyle = (c) => (c.sticky
    ? { left: stickyLeft.get(c.key), minWidth: c.width, maxWidth: c.width }
    : c.width ? { minWidth: c.width } : undefined)
  const stickyClass = (c) => [c.sticky && 'sticky-col', c.sticky && c.key === lastSticky && 'sticky-col-end', c.stickyRight && 'sticky-col-right'].filter(Boolean).join(' ')

  const allTicked = selectable && rows.length > 0 && rows.every((r) => selected?.has(rowKey(r)))
  const tick = (key) => { const next = new Set(selected); next.has(key) ? next.delete(key) : next.add(key); onSelectedChange?.(next) }
  const tickAll = () => { const next = new Set(selected); for (const r of rows) allTicked ? next.delete(rowKey(r)) : next.add(rowKey(r)); onSelectedChange?.(next) }

  const value = (row, c) => (c.get ? c.get(row) : row[c.key])
  const cellContent = (row, c) => {
    if (c.render) return c.render(row, cellCtx)
    const v = value(row, c)
    return v == null || v === '' ? <span className="text-neutral-500">—</span> : c.fmt ? c.fmt(v) : v
  }

  function exportCsv() {
    const q = (s) => { const t = s == null ? '' : String(s); return /[",\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t }
    const head = visibleCols.map((c) => q(c.group && groupByKey.get(c.group) && !groupByKey.get(c.group).flat ? `${groupByKey.get(c.group).label} — ${c.label}` : c.label))
    const body = rows.map((r) => visibleCols.map((c) => q(c.export ? c.export(r) : value(r, c))))
    downloadCsv(`${exportName}-${new Date().toISOString().slice(0, 10)}.csv`, [head.join(','), ...body.map((b) => b.join(','))].join('\n'))
  }

  // Columns picker: grouped, with a toggle per group and per column.
  const pickable = table.columns.filter((c) => !c.always)
  const pickerGroups = []
  for (const c of pickable) {
    const g = c.group ? groupByKey.get(c.group) ?? { key: c.group, label: c.group } : { key: '_', label: 'Other' }
    const entry = pickerGroups.find((p) => p.group.key === g.key)
    entry ? entry.cols.push(c) : pickerGroups.push({ group: g, cols: [c] })
  }

  const HeadCell = ({ col, rowSpan, sub }) => {
    const on = sort.key === col.key
    const sortable = col.sortable !== false
    return (
      <th
        rowSpan={rowSpan}
        className={[col.num && 'num', col.center && 'center-header', sortable && 'sortable', sub && 'th-sub', col.title && 'th-tip', stickyClass(col), col.headClass].filter(Boolean).join(' ')}
        style={stickyStyle(col)}
        onClick={sortable ? () => toggleSort(col.key) : undefined}
        aria-sort={sortable ? (on ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none') : undefined}
        title={col.title}
      >
        {selectable && col === visibleCols[0] && (
          <input type="checkbox" className="mr-2 align-[-2px]" aria-label="Select every row shown" checked={allTicked}
            onClick={(e) => e.stopPropagation()} onChange={tickAll} />
        )}
        {col.label}
        {on && (sort.dir === 1 ? ' ▲' : ' ▼')}
      </th>
    )
  }

  return (
    <div className={className}>
      {!hideToolbar && (
        <div className={`relative mt-3 flex-wrap items-center gap-2 ${showOnMobile ? 'flex' : 'hidden sm:flex'}`}>
          {toolbarLeft}
          {table.hasPresets && (
            <>
              <span className="text-[12px] text-neutral-500">Columns</span>
              <div className="flex overflow-hidden rounded-full border border-white/10 text-[12px] font-medium" role="group" aria-label="Column preset">
                {[['simple', 'Simple'], ['full', 'Full']].map(([k, label]) => (
                  <button key={k} type="button" onClick={() => table.setPreset(k)} aria-pressed={table.preset === k}
                    className={`px-3 py-1 transition-colors ${table.preset === k ? 'bg-brand-green/15 text-brand-green' : 'text-neutral-400 hover:text-white'}`}>
                    {label}
                  </button>
                ))}
              </div>
            </>
          )}
          {pickable.length > 0 && (
            <button type="button" onClick={() => setPickerOpen((v) => !v)} aria-expanded={pickerOpen}
              className="rounded-full border border-white/10 px-3 py-1 text-[12px] font-medium text-neutral-300 hover:border-white/20 hover:text-white">
              {table.hasPresets ? 'Choose' : 'Columns'}{table.preset === 'full' && table.hidden.size ? ` · ${table.hidden.size} hidden` : ''} ▾
            </button>
          )}
          {pickerOpen && (
            <div className="absolute left-0 top-full z-20 mt-1 flex max-h-[60vh] w-80 flex-col gap-2 overflow-auto rounded-xl border border-white/10 bg-[#11161c] p-3 shadow-xl">
              <p className="text-[11px] uppercase tracking-wide text-neutral-500">Show columns</p>
              {pickerGroups.map(({ group, cols }) => {
                const keys = cols.map((c) => c.key)
                const shown = keys.filter((k) => !table.hidden.has(k)).length
                return (
                  <div key={group.key} className="flex flex-col gap-1">
                    <label className="flex cursor-pointer items-center gap-2 text-[13px] font-medium text-neutral-100">
                      <input type="checkbox" checked={shown === keys.length} ref={(el) => { if (el) el.indeterminate = shown > 0 && shown < keys.length }}
                        onChange={() => table.toggleGroup(keys)} />
                      {group.label}
                    </label>
                    {cols.length > 1 && cols.map((c) => (
                      <label key={c.key} className="ml-6 flex cursor-pointer items-center gap-2 text-[12px] text-neutral-300">
                        <input type="checkbox" checked={!table.hidden.has(c.key)} onChange={() => table.toggleColumn(c.key)} />
                        {c.label}
                      </label>
                    ))}
                  </div>
                )
              })}
              <p className="text-[11px] text-neutral-500">
                {table.columns.filter((c) => c.always).map((c) => c.label).join(', ')} always show.{table.hasPresets ? ' Ticking here switches to Full.' : ''}
              </p>
            </div>
          )}
          {exportName && (
            <button type="button" onClick={exportCsv} title="Download the rows and columns shown as a CSV (opens in Excel)"
              className="inline-flex items-center gap-1.5 rounded-full border border-white/10 px-3 py-1 text-[12px] font-medium text-neutral-300 hover:border-white/20 hover:text-white">
              <Download size={12} aria-hidden="true" /> Export CSV
            </button>
          )}
          {toolbar}
        </div>
      )}

      <div className={`table-scroll ${twoRows ? 'table-freeze' : ''} mt-2 ${showOnMobile ? '' : 'hidden sm:block'}`}>
        <table className={`data-table ${compact ? 'data-table--compact' : ''}`}>
          <thead>
            <tr>
              {headRow1.map((h) => (h.group
                ? <th key={h.group.key} colSpan={h.span} className="th-group">{h.group.label}</th>
                : <HeadCell key={h.col.key} col={h.col} rowSpan={twoRows ? 2 : 1} />))}
            </tr>
            {twoRows && <tr>{subCols.map((col) => <HeadCell key={col.key} col={col} sub />)}</tr>}
          </thead>
          <tbody>
            {rows.map((row) => {
              const key = rowKey(row)
              const rp = rowProps?.(row) ?? {}
              const isOpen = expandable && expanded?.has(key)
              const clickable = expandable || onRowClick
              const activate = () => (expandable ? onToggleExpanded?.(key) : onRowClick?.(row))
              return (
                <Fragment key={key}>
                  <tr
                    {...rp}
                    className={[clickable && 'cursor-pointer', onRowClick && !expandable && 'row-clickable', selected?.has(key) && 'is-selected', rp.className].filter(Boolean).join(' ')}
                    tabIndex={clickable ? 0 : undefined}
                    role={onRowClick && !expandable ? 'button' : undefined}
                    aria-expanded={expandable ? isOpen : undefined}
                    onClick={clickable ? activate : undefined}
                    onKeyDown={clickable ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); activate() } } : undefined}
                  >
                    {visibleCols.map((col, i) => (
                      <td key={col.key}
                        className={[col.num && 'num tabular', stickyClass(col), col.cellClass, col.strong && 'font-medium'].filter(Boolean).join(' ')}
                        style={{ ...stickyStyle(col), ...(col.cellStyle?.(row) ?? {}) }}>
                        {i === 0 && selectable && (
                          <input type="checkbox" className="mr-2 align-[-2px]" aria-label={`Select ${key}`} checked={!!selected?.has(key)}
                            onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()} onChange={() => tick(key)} />
                        )}
                        {i === 0 && expandable && (
                          <span className={`mr-1.5 inline-block text-neutral-500 transition-transform ${isOpen ? 'rotate-90' : ''}`} aria-hidden="true">›</span>
                        )}
                        {cellContent(row, col)}
                      </td>
                    ))}
                  </tr>
                  {isOpen && (
                    <tr className={rp.className} style={rp.style}>
                      <td colSpan={visibleCols.length} className="bg-white/[0.02]" style={visibleCols[0]?.cellStyle?.(row)}>
                        {/* sticky so the detail stays in view when the table is scrolled sideways */}
                        <div className="sticky left-0 max-w-3xl py-2 pl-6">{renderDetail?.(row)}</div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
            {rows.length === 0 && (
              <tr><td colSpan={visibleCols.length} className="empty-row">{emptyText}</td></tr>
            )}
          </tbody>
          {totals && (
            <tfoot>
              <tr className="totals-row">
                {visibleCols.map((col) => {
                  const v = totals[col.key]
                  const content = v == null || v === '' ? '' : typeof v === 'string' ? v : col.fmtTotal ? col.fmtTotal(v) : col.fmt ? col.fmt(v) : Math.round(v * 100) / 100
                  return <td key={col.key} className={[col.num && 'num', stickyClass(col)].filter(Boolean).join(' ')} style={stickyStyle(col)}>{content}</td>
                })}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  )
}
