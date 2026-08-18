import { useState } from 'react'
import { pollStagedStatus } from '../lib/pollStagedStatus'

const UPLOAD_WORKER_URL = 'https://cde-data-upload.fkw24.workers.dev'

// Jan-Dec hours-allocation columns (cols F-Q, 0-indexed 5-16) plus the
// notes column (S, 0-indexed 18) — the only manual entry on this sheet.
// Job identity and Quoted/Used/Remaining hours are formulas and are never
// written to from here.
const MONTH_FIELDS = [
  { key: 'Jan', col: 5 }, { key: 'Feb', col: 6 }, { key: 'Mar', col: 7 },
  { key: 'Apr', col: 8 }, { key: 'May', col: 9 }, { key: 'Jun', col: 10 },
  { key: 'Jul', col: 11 }, { key: 'Aug', col: 12 }, { key: 'Sep', col: 13 },
  { key: 'Oct', col: 14 }, { key: 'Nov', col: 15 }, { key: 'Dec', col: 16 },
]
const NOTES_COL = 18

function EditableCell({ value, saving, numeric, onChange }) {
  const [text, setText] = useState(value)
  return (
    <input
      type={numeric ? 'number' : 'text'}
      value={text}
      disabled={saving}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        if (text !== value) onChange(text)
      }}
      className="w-full min-w-0 rounded-md border border-white/10 bg-white/[0.04] px-2 py-1 text-[13px] text-neutral-200 focus:border-brand-green/50 focus:outline-none disabled:opacity-50"
    />
  )
}

export default function UpcomingWorkTab({ upcomingWork, onBack }) {
  const { jobs } = upcomingWork
  const [password, setPassword] = useState('')
  const [values, setValues] = useState(() => {
    const map = {}
    for (const job of jobs) {
      map[job.jobNumber] = { notes: job.notes }
      for (const field of MONTH_FIELDS) map[job.jobNumber][field.key] = job.months[field.key] ?? ''
    }
    return map
  })
  const [savingKeys, setSavingKeys] = useState(() => new Set())
  const [status, setStatus] = useState({ kind: 'idle', message: '' })

  async function handleChange(job, key, col, newValue) {
    const cellKey = `${job.jobNumber}:${key}`
    const previousValue = values[job.jobNumber][key]
    if (!password) {
      setStatus({ kind: 'error', message: 'Enter the upload password above before making changes.' })
      return
    }

    setValues((prev) => ({ ...prev, [job.jobNumber]: { ...prev[job.jobNumber], [key]: newValue } }))
    setSavingKeys((prev) => new Set(prev).add(cellKey))
    setStatus({ kind: 'idle', message: '' })

    function revert(message) {
      setValues((prev) => ({ ...prev, [job.jobNumber]: { ...prev[job.jobNumber], [key]: previousValue } }))
      setStatus({ kind: 'error', message })
    }

    try {
      const res = await fetch(`${UPLOAD_WORKER_URL}/upcoming-work`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ password, edits: [{ jobNumber: job.jobNumber, col, value: newValue }] }),
      })
      const payload = await res.json()
      if (!res.ok) {
        revert(payload.message ?? `Save failed (${res.status}) — reverted.`)
        return
      }

      setStatus({ kind: 'idle', message: `Saving "${key}" for ${job.jobNumber} ${job.jobName}…` })
      const result = await pollStagedStatus(payload.staged)
      if (result.status === 'done') {
        setStatus({
          kind: 'ok',
          message: `Saved "${key}" for ${job.jobNumber} ${job.jobName} — the site will redeploy in about a minute before it shows up here.`,
        })
      } else if (result.status === 'failed') {
        revert(`${result.message} — reverted.`)
      } else {
        setStatus({ kind: 'error', message: `Still processing "${key}" after 3 minutes — check back shortly; the change may still land.` })
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
        <span className="text-text-primary">Upcoming work</span>
      </nav>

      <div>
        <h1 className="text-2xl font-semibold text-white">Upcoming work</h1>
        <p className="mt-1 text-sm text-neutral-400">
          Planned hours per month per job, from the workbook&apos;s Upcoming Work Calculator sheet.
          Quoted/Used/Remaining hours are calculated — only the monthly plan and notes are editable.
        </p>
      </div>

      <div className="rounded-[18px] border border-white/[0.06] bg-[#11161c] p-5">
        <label htmlFor="upcoming-work-password" className="mb-1.5 block text-xs text-neutral-500">
          Upload password — required before any change can save
        </label>
        <input
          id="upcoming-work-password"
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

      <div className="rounded-[18px] border border-white/[0.06] bg-[#11161c] p-6">
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Job</th>
                <th className="num">Quoted hrs</th>
                <th className="num">Used hrs</th>
                <th className="num">Remaining hrs</th>
                {MONTH_FIELDS.map((f) => (
                  <th key={f.key} className="num">
                    {f.key}
                  </th>
                ))}
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((job) => (
                <tr key={job.jobNumber}>
                  <td className="whitespace-nowrap">
                    {job.jobNumber} {job.jobName}
                  </td>
                  <td className="num tabular">{job.quotedHours ?? '—'}</td>
                  <td className="num tabular">{job.usedHours ?? '—'}</td>
                  <td className="num tabular">{job.remainingHours ?? '—'}</td>
                  {MONTH_FIELDS.map((field) => (
                    <td key={field.key} className="min-w-[80px] p-1">
                      <EditableCell
                        value={values[job.jobNumber][field.key]}
                        saving={savingKeys.has(`${job.jobNumber}:${field.key}`)}
                        numeric
                        onChange={(newValue) => handleChange(job, field.key, field.col, newValue)}
                      />
                    </td>
                  ))}
                  <td className="min-w-[160px] p-1">
                    <EditableCell
                      value={values[job.jobNumber].notes}
                      saving={savingKeys.has(`${job.jobNumber}:notes`)}
                      numeric={false}
                      onChange={(newValue) => handleChange(job, 'notes', NOTES_COL, newValue)}
                    />
                  </td>
                </tr>
              ))}
              {jobs.length === 0 && (
                <tr>
                  <td colSpan={5 + MONTH_FIELDS.length} className="empty-row">
                    No jobs to show.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
