import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { pollStagedStatus } from '../lib/pollStagedStatus'

const UPLOAD_WORKER_URL = 'https://cde-data-upload.fkw24.workers.dev'

// The underlying sheet is still just one line of free text per row — a
// "[x] "/"[ ] " marker at the start of each line is how a checked/unchecked
// state round-trips through that, entirely on the frontend side; the
// backend (apply-notes-edits.mjs) still just splits on newlines and writes
// each line back, unchanged. Blank lines and un-marked legacy lines (the
// original notes had section headers like "Koawa:" with no marker at all)
// come in unchecked rather than being dropped, so nothing existing is lost
// the first time this loads.
function parseItems(text) {
  return text
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line, i) => {
      const m = line.match(/^\[( |x|X)\]\s?(.*)$/)
      return m ? { id: i, text: m[2], done: m[1].toLowerCase() === 'x' } : { id: i, text: line, done: false }
    })
}
function serializeItems(items) {
  return items.map((item) => `[${item.done ? 'x' : ' '}] ${item.text}`).join('\n')
}

function TodoPanel({ person, label, value, onSave }) {
  const [items, setItems] = useState(() => parseItems(value))
  const [newItemText, setNewItemText] = useState('')
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState({ kind: 'idle', message: '' })
  let nextId = Math.max(0, ...items.map((i) => i.id)) + 1

  async function persist(nextItems) {
    // Optimistic — a checkbox/delete/add should react immediately, not
    // wait out the staged-save round trip (which can take up to a few
    // minutes on a timeout) before showing any visible change. Reverted
    // if the save actually fails.
    const previous = items
    setItems(nextItems)
    setSaving(true)
    setStatus({ kind: 'idle', message: '' })
    const result = await onSave(person, serializeItems(nextItems))
    setSaving(false)
    setStatus(result)
    if (result.kind === 'error') setItems(previous)
  }

  function toggleDone(id) {
    persist(items.map((item) => (item.id === id ? { ...item, done: !item.done } : item)))
  }
  function deleteItem(id) {
    persist(items.filter((item) => item.id !== id))
  }
  function addItem(e) {
    e.preventDefault()
    if (!newItemText.trim()) return
    persist([...items, { id: nextId, text: newItemText.trim(), done: false }])
    setNewItemText('')
  }

  return (
    <div className="flex flex-col gap-3 rounded-[18px] border border-white/[0.06] bg-[#11161c] p-6">
      <h2 className="text-[15px] font-medium text-neutral-100">{label}</h2>

      <ul className="flex flex-col gap-1.5">
        {items.map((item) => (
          <li key={item.id} className="group flex items-start gap-2.5 rounded-lg px-2 py-1.5 hover:bg-white/[0.03]">
            <input
              type="checkbox"
              checked={item.done}
              disabled={saving}
              onChange={() => toggleDone(item.id)}
              className="mt-0.5 shrink-0 disabled:opacity-50"
            />
            <span className={`min-w-0 flex-1 text-[13px] leading-relaxed ${item.done ? 'text-neutral-600 line-through' : 'text-neutral-200'}`}>
              {item.text}
            </span>
            <button
              type="button"
              onClick={() => deleteItem(item.id)}
              disabled={saving}
              aria-label={`Delete "${item.text}"`}
              className="shrink-0 text-neutral-600 opacity-0 transition-opacity group-hover:opacity-100 hover:text-red-400 disabled:opacity-50"
            >
              <Trash2 size={14} aria-hidden="true" />
            </button>
          </li>
        ))}
        {items.length === 0 && <li className="px-2 py-1.5 text-[13px] text-neutral-500">Nothing here yet.</li>}
      </ul>

      <form onSubmit={addItem} className="flex items-center gap-2 border-t border-white/10 pt-3">
        <input
          type="text"
          value={newItemText}
          onChange={(e) => setNewItemText(e.target.value)}
          placeholder="Add an item…"
          disabled={saving}
          className="min-w-0 flex-1 rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-[13px] text-neutral-200 focus:border-brand-green/50 focus:outline-none disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={saving || !newItemText.trim()}
          className="flex shrink-0 items-center gap-1 rounded-lg border border-white/10 px-3 py-1.5 text-[13px] text-neutral-300 transition-colors hover:border-brand-green/40 hover:text-brand-green disabled:opacity-50"
        >
          <Plus size={14} aria-hidden="true" />
          Add
        </button>
      </form>

      <p className="text-[12px] text-neutral-500">
        {saving ? 'Saving…' : status.message || 'Saves automatically on every change.'}
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
          To-do lists, from the workbook&apos;s Note Cam / Note Tom pages.
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

      <TodoPanel person="cam" label="Cam's notes" value={notes.cam} onSave={saveNote} />
      <TodoPanel person="tom" label="Tom's notes" value={notes.tom} onSave={saveNote} />
    </div>
  )
}
