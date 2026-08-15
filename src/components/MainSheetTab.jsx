import { useMemo, useState } from 'react'
import { Settings2 } from 'lucide-react'

const UPLOAD_WORKER_URL = 'https://cde-data-upload.fkw24.workers.dev'

// Clicking a checklist cell cycles it through this sequence rather than
// requiring a dropdown or drag gesture — fast for the common case (most
// cells just need to flip Yes/No) while still reaching N/A and "not set".
const CYCLE = ['', 'Yes', 'No', 'N/A']

function nextValue(current) {
  const idx = CYCLE.indexOf(current)
  return CYCLE[(idx + 1) % CYCLE.length]
}

function ChecklistCell({ value, onClick }) {
  const styles = {
    Yes: 'border-brand-green/40 bg-brand-green/10 text-brand-green',
    No: 'border-red-500/30 bg-red-500/10 text-red-400',
    'N/A': 'border-white/10 bg-white/[0.04] text-neutral-500',
    '': 'border-white/10 bg-white/[0.02] text-neutral-600',
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full rounded-md border px-2 py-1 text-center text-[12px] font-medium transition-colors hover:border-white/25 ${styles[value] ?? styles['']}`}
    >
      {value || '—'}
    </button>
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
  const [dirty, setDirty] = useState(false)
  const [password, setPassword] = useState('')
  const [saveStatus, setSaveStatus] = useState('idle') // idle | submitting | done | error
  const [saveMessage, setSaveMessage] = useState('')

  const visibleColumns = useMemo(() => columns.filter((c) => visibleKeys.has(c.key)), [columns, visibleKeys])

  function toggleColumn(key) {
    setVisibleKeys((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function cycleCell(jobNumber, colKey) {
    setValues((prev) => ({
      ...prev,
      [jobNumber]: { ...prev[jobNumber], [colKey]: nextValue(prev[jobNumber][colKey]) },
    }))
    setDirty(true)
    setSaveStatus('idle')
  }

  async function handleSave(e) {
    e.preventDefault()
    setSaveStatus('submitting')
    setSaveMessage('')

    const edits = []
    for (const job of jobs) {
      for (const column of columns) {
        const newVal = values[job.jobNumber][column.key]
        if (newVal !== job.checklist[column.key]) {
          edits.push({ jobNumber: job.jobNumber, col: column.col, value: newVal })
        }
      }
    }

    try {
      const res = await fetch(`${UPLOAD_WORKER_URL}/main-sheet`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ password, edits }),
      })
      const payload = await res.json()
      if (!res.ok) {
        setSaveMessage(payload.message ?? `Request failed (${res.status}).`)
        setSaveStatus('error')
        return
      }
      setSaveMessage(`Saved ${edits.length} change(s). The dashboard will rebuild in a couple of minutes.`)
      setSaveStatus('done')
      setDirty(false)
    } catch (err) {
      setSaveMessage(`Could not reach the upload service: ${String(err.message ?? err)}`)
      setSaveStatus('error')
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
            Click a cell to cycle Yes → No → N/A → not set. From the workbook&apos;s Main Sheet.
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

      <div className="flex items-start gap-6">
        <div className="min-w-0 flex-1 rounded-[18px] border border-white/[0.06] bg-[#11161c] p-6">
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Job</th>
                  {visibleColumns.map((c) => (
                    <th key={c.key} className="whitespace-normal align-bottom text-[11px] leading-tight">
                      {c.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {jobs.map((job) => (
                  <tr key={job.jobNumber}>
                    <td className="whitespace-nowrap">
                      {job.jobNumber} {job.jobName}
                    </td>
                    {visibleColumns.map((c) => (
                      <td key={c.key} className="min-w-[84px] p-1">
                        <ChecklistCell
                          value={values[job.jobNumber][c.key]}
                          onClick={() => cycleCell(job.jobNumber, c.key)}
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

      <div className="rounded-[18px] border border-white/[0.06] bg-[#11161c] p-6">
        <form onSubmit={handleSave} className="flex flex-wrap items-end gap-3">
          <div className="flex-1">
            <label htmlFor="main-sheet-password" className="mb-1.5 block text-xs text-neutral-500">
              Upload password
            </label>
            <input
              id="main-sheet-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full max-w-xs rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-sm text-white focus:border-brand-green/50 focus:outline-none"
            />
          </div>
          <button
            type="submit"
            disabled={!dirty || saveStatus === 'submitting'}
            className="rounded-lg bg-brand-green px-4 py-2 text-sm font-semibold text-[#06210a] transition-colors hover:bg-brand-green/90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {saveStatus === 'submitting' ? 'Saving…' : 'Save changes'}
          </button>
        </form>
        {saveMessage && (
          <p className={`mt-3 text-sm ${saveStatus === 'error' ? 'text-red-400' : 'text-neutral-300'}`}>
            {saveMessage}
          </p>
        )}
      </div>
    </div>
  )
}
