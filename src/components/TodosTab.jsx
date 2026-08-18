import { useMemo, useState } from 'react'
import { ArrowLeft, Plus, Trash2 } from 'lucide-react'
import { pollStagedStatus } from '../lib/pollStagedStatus'

const UPLOAD_WORKER_URL = 'https://cde-data-upload.fkw24.workers.dev'

export default function TodosTab({ todos, onBack }) {
  const [items, setItems] = useState(todos)
  const [selectedPerson, setSelectedPerson] = useState(null)
  const [addingPerson, setAddingPerson] = useState(false)
  const [newPersonName, setNewPersonName] = useState('')
  const [newItemText, setNewItemText] = useState('')
  const [password, setPassword] = useState('')
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState({ kind: 'idle', message: '' })

  // Distinct people are derived from whoever already has at least one
  // item — a brand-new person only actually "exists" in the saved data
  // once their first item is added, so there's nothing to track
  // separately for "known people with zero tasks".
  const people = useMemo(() => [...new Set(items.map((t) => t.person))].sort(), [items])
  const personItems = selectedPerson ? items.filter((t) => t.person === selectedPerson) : []

  async function persist(nextItems) {
    if (!password) {
      setStatus({ kind: 'error', message: 'Enter the upload password above before making changes.' })
      return
    }
    const previous = items
    setItems(nextItems) // optimistic — see NotesTab's old reasoning, same idea
    setSaving(true)
    setStatus({ kind: 'idle', message: '' })
    try {
      const res = await fetch(`${UPLOAD_WORKER_URL}/todos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ password, todos: nextItems }),
      })
      const payload = await res.json()
      if (!res.ok) {
        setItems(previous)
        setStatus({ kind: 'error', message: payload.message ?? `Save failed (${res.status}).` })
        setSaving(false)
        return
      }
      const result = await pollStagedStatus(payload.staged)
      setSaving(false)
      if (result.status === 'done') {
        setStatus({ kind: 'ok', message: 'Saved — the site will redeploy in about a minute before it shows up here.' })
      } else if (result.status === 'failed') {
        setItems(previous)
        setStatus({ kind: 'error', message: result.message })
      } else {
        // Timed out waiting — the workflow may still finish it later, so
        // don't revert (that could fight a save that lands right after).
        setStatus({ kind: 'error', message: 'Still processing after 3 minutes — check back shortly; the change may still land.' })
      }
    } catch (err) {
      setItems(previous)
      setSaving(false)
      setStatus({ kind: 'error', message: `Could not reach the upload service: ${String(err.message ?? err)}` })
    }
  }

  function toggleDone(id) {
    persist(items.map((t) => (t.id === id ? { ...t, done: !t.done } : t)))
  }
  function deleteItem(id) {
    persist(items.filter((t) => t.id !== id))
  }
  function addItemFor(person, text) {
    const id = `${person}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    persist([...items, { id, person, text, done: false }])
  }

  function handleAddItem(e) {
    e.preventDefault()
    if (!newItemText.trim()) return
    addItemFor(selectedPerson, newItemText.trim())
    setNewItemText('')
  }

  function handleAddPerson(e) {
    e.preventDefault()
    const name = newPersonName.trim()
    if (!name) return
    setSelectedPerson(name)
    setAddingPerson(false)
    setNewPersonName('')
  }

  const passwordField = (
    <div className="rounded-[18px] border border-white/[0.06] bg-[#11161c] p-5">
      <label htmlFor="todos-password" className="mb-1.5 block text-xs text-neutral-500">
        Upload password — required before any change can save
      </label>
      <input
        id="todos-password"
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
  )

  if (!selectedPerson) {
    return (
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
        <nav className="flex items-center gap-1.5 text-sm text-text-muted">
          <button className="transition-colors hover:text-text-primary" onClick={onBack}>
            Operations overview
          </button>
          <span aria-hidden="true">/</span>
          <span className="text-text-primary">Notes</span>
        </nav>

        <div>
          <h1 className="text-2xl font-semibold text-white">Notes</h1>
          <p className="mt-1 text-sm text-neutral-400">Pick a name to see their to-do list.</p>
        </div>

        {passwordField}

        <div className="flex flex-wrap gap-2">
          {people.map((person) => (
            <button
              key={person}
              onClick={() => setSelectedPerson(person)}
              className="rounded-full border border-white/10 px-4 py-2 text-sm font-medium text-neutral-200 transition-colors hover:border-brand-green/40 hover:text-brand-green"
            >
              {person}
              <span className="ml-1.5 text-neutral-500">
                {items.filter((t) => t.person === person && !t.done).length}
              </span>
            </button>
          ))}

          {!addingPerson ? (
            <button
              onClick={() => setAddingPerson(true)}
              className="flex items-center gap-1 rounded-full border border-dashed border-white/15 px-4 py-2 text-sm text-neutral-400 transition-colors hover:border-brand-green/40 hover:text-brand-green"
            >
              <Plus size={14} aria-hidden="true" />
              New person
            </button>
          ) : (
            <form onSubmit={handleAddPerson} className="flex items-center gap-2">
              <input
                type="text"
                autoFocus
                value={newPersonName}
                onChange={(e) => setNewPersonName(e.target.value)}
                placeholder="Name"
                className="w-32 rounded-full border border-white/[0.08] bg-white/[0.04] px-3 py-1.5 text-sm text-white focus:border-brand-green/50 focus:outline-none"
              />
              <button
                type="submit"
                className="rounded-full border border-white/10 px-3 py-1.5 text-sm text-neutral-300 hover:border-brand-green/40 hover:text-brand-green"
              >
                Go
              </button>
            </form>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <nav className="flex items-center gap-1.5 text-sm text-text-muted">
        <button className="transition-colors hover:text-text-primary" onClick={onBack}>
          Operations overview
        </button>
        <span aria-hidden="true">/</span>
        <button className="transition-colors hover:text-text-primary" onClick={() => setSelectedPerson(null)}>
          Notes
        </button>
        <span aria-hidden="true">/</span>
        <span className="text-text-primary">{selectedPerson}</span>
      </nav>

      <button
        onClick={() => setSelectedPerson(null)}
        className="flex w-fit items-center gap-1.5 text-sm text-neutral-400 transition-colors hover:text-white"
      >
        <ArrowLeft size={14} aria-hidden="true" />
        Back to people
      </button>

      {passwordField}

      <div className="flex flex-col gap-3 rounded-[18px] border border-white/[0.06] bg-[#11161c] p-6">
        <h2 className="text-[15px] font-medium text-neutral-100">{selectedPerson}&apos;s notes</h2>

        <ul className="flex flex-col gap-1.5">
          {personItems.map((item) => (
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
          {personItems.length === 0 && <li className="px-2 py-1.5 text-[13px] text-neutral-500">Nothing here yet.</li>}
        </ul>

        <form onSubmit={handleAddItem} className="flex items-center gap-2 border-t border-white/10 pt-3">
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
      </div>
    </div>
  )
}
