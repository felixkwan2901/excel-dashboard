import { useState } from 'react'
import { pollStagedStatus } from '../lib/pollStagedStatus'

const UPLOAD_WORKER_URL = 'https://cde-data-upload.fkw24.workers.dev'

// One free-text page per person, saved on blur rather than per-keystroke —
// unlike the checklist's per-cell saves, a note is a big block of text
// someone might pause mid-sentence in, so saving on every keystroke would
// be wasteful and could race itself.
function NotePanel({ person, label, value, onSave }) {
  const [text, setText] = useState(value)
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState({ kind: 'idle', message: '' })

  async function handleBlur() {
    if (text === value) return
    setSaving(true)
    setStatus({ kind: 'idle', message: '' })
    const result = await onSave(person, text)
    setSaving(false)
    setStatus(result)
  }

  return (
    <div className="flex flex-col gap-2 rounded-[18px] border border-white/[0.06] bg-[#11161c] p-6">
      <h2 className="text-[15px] font-medium text-neutral-100">{label}</h2>
      <textarea
        value={text}
        disabled={saving}
        onChange={(e) => setText(e.target.value)}
        onBlur={handleBlur}
        rows={16}
        className="w-full resize-y rounded-lg border border-white/[0.08] bg-white/[0.03] p-3 font-mono text-[13px] leading-relaxed text-neutral-200 focus:border-brand-green/50 focus:outline-none disabled:opacity-60"
      />
      <p className="text-[12px] text-neutral-500">
        {saving
          ? 'Saving…'
          : status.message || 'Saves automatically when you click away.'}
      </p>
    </div>
  )
}

export default function NotesTab({ notes, onBack }) {
  const [password, setPassword] = useState('')

  async function saveNote(person, text) {
    if (!password) {
      return { kind: 'error', message: 'Enter the upload password above before making changes.' }
    }
    try {
      const res = await fetch(`${UPLOAD_WORKER_URL}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ password, person, text }),
      })
      const payload = await res.json()
      if (!res.ok) {
        return { kind: 'error', message: payload.message ?? `Save failed (${res.status}).` }
      }
      const result = await pollStagedStatus(payload.staged)
      if (result.status === 'done') {
        return { kind: 'ok', message: 'Saved — the site will redeploy in about a minute before it shows up here.' }
      }
      if (result.status === 'failed') {
        return { kind: 'error', message: result.message }
      }
      return { kind: 'error', message: 'Still processing after 3 minutes — check back shortly; it may still land.' }
    } catch (err) {
      return { kind: 'error', message: `Could not reach the upload service: ${String(err.message ?? err)}` }
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <nav className="flex items-center gap-1.5 text-sm text-text-muted">
        <button className="transition-colors hover:text-text-primary" onClick={onBack}>
          Operations overview
        </button>
        <span aria-hidden="true">/</span>
        <span className="text-text-primary">Notes</span>
      </nav>

      <div>
        <h1 className="text-2xl font-semibold text-white">Notes</h1>
        <p className="mt-1 text-sm text-neutral-400">
          Running to-do notes, from the workbook&apos;s Note Cam / Note Tom pages.
        </p>
      </div>

      <div className="rounded-[18px] border border-white/[0.06] bg-[#11161c] p-5">
        <label htmlFor="notes-password" className="mb-1.5 block text-xs text-neutral-500">
          Upload password — required before any change can save
        </label>
        <input
          id="notes-password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full max-w-xs rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-sm text-white focus:border-brand-green/50 focus:outline-none"
        />
      </div>

      <NotePanel person="cam" label="Cam's notes" value={notes.cam} onSave={saveNote} />
      <NotePanel person="tom" label="Tom's notes" value={notes.tom} onSave={saveNote} />
    </div>
  )
}
