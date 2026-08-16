import { useMemo, useState } from 'react'
import { Settings2 } from 'lucide-react'
import { pollStagedStatus } from '../lib/pollStagedStatus'

const UPLOAD_WORKER_URL = 'https://cde-data-upload.fkw24.workers.dev'

const OPTIONS = [
  { value: '', label: 'Not set' },
  { value: 'Yes', label: 'Yes' },
  { value: 'No', label: 'No' },
  { value: 'N/A', label: 'N/A' },
]

const SELECT_STYLES = {
  Yes: 'border-brand-green/40 bg-brand-green/10 text-brand-green',
  No: 'border-red-500/30 bg-red-500/10 text-red-400',
  'N/A': 'border-white/10 bg-white/[0.04] text-neutral-500',
  '': 'border-white/10 bg-white/[0.02] text-neutral-600',
}

// A real <select> instead of a click-to-cycle button — opens as a native
// dropdown you scroll/pick from (works the same with a trackpad, a touch
// screen, or a keyboard), rather than requiring repeated taps to reach the
// value you want.
function ChecklistCell({ value, saving, onChange }) {
  return (
    <select
      value={value}
      disabled={saving}
      onChange={(e) => onChange(e.target.value)}
      className={`w-full rounded-md border px-2 py-1 text-center text-[12px] font-medium transition-colors focus:border-brand-green/50 focus:outline-none disabled:opacity-50 ${SELECT_STYLES[value] ?? SELECT_STYLES['']}`}
    >
      {OPTIONS.map((o) => (
        <option key={o.value} value={o.value} className="bg-[#11161c] text-neutral-200">
          {o.label}
        </option>
      ))}
    </select>
  )
}

export default function MainSheetTab({ mainSheet, onBack }) {
  const { jobs, columns } = mainSheet

  const [visibleKeys, setVisibleKeys] = useState(() => new Set(columns.map((c) => c.key)))
  const [panelOpen, setPanelOpen] = useState(false)
  const [values, setValues] = useState(() => {
    const map = {}
    for (const job of jobs) map[job.jobNumber] = { ...job.checklist }
    return map
  })
  const [password, setPassword] = useState('')
  const [savingKeys, setSavingKeys] = useState(() => new Set())
  const [status, setStatus] = useState({ kind: 'idle', message: '' }) // idle | ok | error
  const [sortDir, setSortDir] = useState(1) // 1 = job number ascending, -1 = descending

  const visibleColumns = useMemo(() => columns.filter((c) => visibleKeys.has(c.key)), [columns, visibleKeys])
  const columnByKey = useMemo(() => new Map(columns.map((c) => [c.key, c])), [columns])
  const sortedJobs = useMemo(
    () => [...jobs].sort((a, b) => (Number(a.jobNumber) - Number(b.jobNumber)) * sortDir),
    [jobs, sortDir]
  )

  function toggleColumn(key) {
    setVisibleKeys((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  async function handleChange(job, colKey, newValue) {
    const cellKey = `${job.jobNumber}:${colKey}`
    const previousValue = values[job.jobNumber][colKey]
    if (newValue === previousValue) return

    if (!password) {
      setStatus({ kind: 'error', message: 'Enter the upload password above before making changes.' })
      return
    }

    setValues((prev) => ({ ...prev, [job.jobNumber]: { ...prev[job.jobNumber], [colKey]: newValue } }))
    setSavingKeys((prev) => new Set(prev).add(cellKey))
    setStatus({ kind: 'idle', message: '' })

    const column = columnByKey.get(colKey)
    function revert(message) {
      setValues((prev) => ({ ...prev, [job.jobNumber]: { ...prev[job.jobNumber], [colKey]: previousValue } }))
      setStatus({ kind: 'error', message })
    }

    try {
      const res = await fetch(`${UPLOAD_WORKER_URL}/main-sheet`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ password, edits: [{ jobNumber: job.jobNumber, col: column.col, value: newValue }] }),
      })
      const payload = await res.json()
      if (!res.ok) {
        revert(payload.message ?? `Save failed (${res.status}) — reverted.`)
        return
      }

      setStatus({ kind: 'idle', message: `Processing "${column.label}" for ${job.jobNumber} ${job.jobName}…` })
      const result = await pollStagedStatus(payload.staged)
      if (result.status === 'done') {
        setStatus({ kind: 'ok', message: `Saved "${column.label}" for ${job.jobNumber} ${job.jobName} — the site will redeploy in about a minute before it shows up here.` })
      } else if (result.status === 'failed') {
        revert(`${result.message} — reverted.`)
      } else {
        // Timed out waiting — the workflow may still finish it later, so
        // don't revert (that could fight a save that lands right after).
        setStatus({
          kind: 'error',
          message: `Still processing "${column.label}" after 3 minutes — check back shortly; the change may still land.`,
        })
      }
    } catch (err) {
      revert(`Could not reach the upload service: ${String(err.message ?? err)} — reverted.`)
    } finally {
      setSavingKeys((prev) => {
        const next = new Set(prev)
        next.delete(cellKey)
        return next
      })
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <nav className="flex items-center gap-1.5 text-sm text-text-muted">
        <button className="transition-colors hover:text-text-primary" onClick={onBack}>
          Operations overview
        </button>
        <span aria-hidden="true">/</span>
        <span className="text-text-primary">Job checklist</span>
      </nav>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-white">Job checklist</h1>
          <p className="mt-1 text-sm text-neutral-400">
            Pick a value from the dropdown to save it — merging takes 30-90 seconds, then the
            site takes another minute or so to redeploy before it shows up here. From the
            workbook&apos;s Main Sheet.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setPanelOpen((v) => !v)}
          aria-pressed={panelOpen}
          className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors ${
            panelOpen
              ? 'border-brand-green/50 bg-brand-green/10 text-brand-green'
              : 'border-white/10 text-neutral-400 hover:border-white/20 hover:text-white'
          }`}
        >
          <Settings2 size={14} aria-hidden="true" />
          Columns shown
        </button>
      </div>

      <div className="rounded-[18px] border border-white/[0.06] bg-[#11161c] p-5">
        <label htmlFor="main-sheet-password" className="mb-1.5 block text-xs text-neutral-500">
          Upload password — required before any change can save
        </label>
        <input
          id="main-sheet-password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full max-w-xs rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-sm text-white focus:border-brand-green/50 focus:outline-none"
        />
        {status.message && (
          <p className={`mt-3 text-sm ${status.kind === 'error' ? 'text-red-400' : 'text-brand-green'}`}>
            {status.message}
          </p>
        )}
      </div>

      <div className="flex items-start gap-6">
        <div className="min-w-0 flex-1 rounded-[18px] border border-white/[0.06] bg-[#11161c] p-6">
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th
                    className="sortable"
                    onClick={() => setSortDir((d) => -d)}
                    aria-sort={sortDir === 1 ? 'ascending' : 'descending'}
                  >
                    Job{sortDir === 1 ? ' ▲' : ' ▼'}
                  </th>
                  {visibleColumns.map((c) => (
                    <th key={c.key} className="whitespace-normal align-bottom text-[11px] leading-tight">
                      {c.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sortedJobs.map((job) => (
                  <tr key={job.jobNumber}>
                    <td className="whitespace-nowrap">
                      {job.jobNumber} {job.jobName}
                    </td>
                    {visibleColumns.map((c) => (
                      <td key={c.key} className="min-w-[84px] p-1">
                        <ChecklistCell
                          value={values[job.jobNumber][c.key]}
                          saving={savingKeys.has(`${job.jobNumber}:${c.key}`)}
                          onChange={(newValue) => handleChange(job, c.key, newValue)}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {panelOpen && (
          <div className="w-64 shrink-0 rounded-[18px] border border-white/[0.06] bg-[#11161c] p-5">
            <h2 className="mb-3 text-[13px] font-semibold tracking-wide text-neutral-400 uppercase">
              Columns shown
            </h2>
            <div className="flex flex-col gap-2">
              {columns.map((c) => (
                <label key={c.key} className="flex items-start gap-2 text-[13px] text-neutral-300">
                  <input
                    type="checkbox"
                    checked={visibleKeys.has(c.key)}
                    onChange={() => toggleColumn(c.key)}
                    className="mt-0.5"
                  />
                  {c.label}
                </label>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
