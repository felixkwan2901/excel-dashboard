// A tiny store for the "Saved — Undo" messages. Any component calls
// toast.saved(...) and <Toasts /> (mounted once in App) shows it for a few
// seconds with an Undo button. No provider, no context — a save can happen
// anywhere, and the message should not care where.
let seq = 0
const listeners = new Set()
let items = []
const emit = () => listeners.forEach((l) => l(items))

export const toast = {
  subscribe(fn) { listeners.add(fn); fn(items); return () => listeners.delete(fn) },
  dismiss(id) { items = items.filter((t) => t.id !== id); emit() },
  // show({ message, undo?, tone? }) — tone 'ok' | 'error'; stays 8 s, or until dismissed.
  show({ message, undo, tone = 'ok', ttl = 8000 }) {
    const id = ++seq
    items = [...items.slice(-2), { id, message, undo, tone }]
    emit()
    if (ttl) setTimeout(() => toast.dismiss(id), ttl)
    return id
  },
  // The common case: a field saved for a job, with a way back.
  saved({ what, job, undo }) {
    const name = job ? `${job.jobNumber}${job.jobName ? ` ${job.jobName}` : ''}` : ''
    return toast.show({ message: `Saved ${what}${name ? ` for ${name}` : ''}.`, undo })
  },
}
