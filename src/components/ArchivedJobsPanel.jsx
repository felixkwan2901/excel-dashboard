import { useState } from 'react'
import { ArchiveRestore } from 'lucide-react'
import { pollStagedStatus } from '../lib/pollStagedStatus'

const UPLOAD_WORKER_URL = 'https://cde-data-upload.fkw24.workers.dev'

// A small, collapsed-by-default panel — archived jobs are the exception,
// not something that should compete for attention with the active job
// list every time someone opens the directory.
export default function ArchivedJobsPanel({ archivedJobs }) {
  const [open, setOpen] = useState(false)
  const [busyJob, setBusyJob] = useState(null)
  const [status, setStatus] = useState({ kind: 'idle', message: '' })

  if (archivedJobs.length === 0) return null

  async function handleUnarchive(job) {
    setBusyJob(job.jobNumber)
    setStatus({ kind: 'idle', message: '' })
    try {
      const res = await fetch(`${UPLOAD_WORKER_URL}/archive-job`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ jobNumber: job.jobNumber, action: 'unarchive' }),
      })
      const payload = await res.json()
      if (!res.ok) {
        setStatus({ kind: 'error', message: payload.message ?? `Request failed (${res.status}).` })
        setBusyJob(null)
        return
      }
      setStatus({ kind: 'idle', message: `Un-archiving ${job.jobNumber} ${job.jobName}…` })
      const result = await pollStagedStatus(payload.staged)
      if (result.status === 'done') {
        setStatus({
          kind: 'ok',
          message: `Un-archived ${job.jobNumber} ${job.jobName} — the site will redeploy in about a minute before it shows back up.`,
        })
      } else if (result.status === 'failed') {
        setStatus({ kind: 'error', message: result.message })
      } else {
        setStatus({ kind: 'error', message: 'Still processing after 3 minutes — check back shortly.' })
      }
    } catch (err) {
      setStatus({ kind: 'error', message: `Could not reach the upload service: ${String(err.message ?? err)}` })
    } finally {
      setBusyJob(null)
    }
  }

  return (
    <div className="rounded-[18px] border border-white/[0.06] bg-[#11161c] p-5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-pressed={open}
        className={`flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors ${
          open
            ? 'border-brand-green/50 bg-brand-green/10 text-brand-green'
            : 'border-white/10 text-neutral-400 hover:border-white/20 hover:text-white'
        }`}
      >
        <ArchiveRestore size={14} aria-hidden="true" />
        Archived jobs ({archivedJobs.length})
      </button>

      {open && (
        <div className="mt-4 flex flex-col gap-3">
          {status.message && (
            <p className={`text-[13px] ${status.kind === 'error' ? 'text-red-400' : 'text-brand-green'}`}>
              {status.message}
            </p>
          )}
          <ul className="flex flex-col gap-2">
            {archivedJobs.map((job) => (
              <li key={job.jobNumber} className="flex items-center justify-between gap-3 text-sm">
                <span className="text-neutral-300">
                  {job.jobNumber} {job.jobName}
                </span>
                <button
                  onClick={() => handleUnarchive(job)}
                  disabled={busyJob === job.jobNumber}
                  className="shrink-0 rounded-lg border border-white/10 px-3 py-1 text-xs text-neutral-300 transition-colors hover:border-brand-green/40 hover:text-brand-green disabled:opacity-50"
                >
                  {busyJob === job.jobNumber ? 'Un-archiving…' : 'Un-archive'}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
