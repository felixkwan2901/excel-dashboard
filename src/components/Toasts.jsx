import { useEffect, useState } from 'react'
import { CheckCircle2, AlertTriangle, X } from 'lucide-react'
import { toast } from '../lib/toast'

// The stack of "Saved — Undo" messages, bottom left, announced to screen
// readers as they arrive. Each one has an Undo (when the save can be put
// back) and a close; they go on their own after a few seconds.
export default function Toasts() {
  const [items, setItems] = useState([])
  useEffect(() => toast.subscribe(setItems), [])
  if (!items.length) return null
  return (
    <div className="no-print fixed bottom-5 left-5 z-40 flex max-w-[calc(100vw-40px)] flex-col gap-2 sm:left-auto sm:right-20" role="status" aria-live="polite">
      {items.map((t) => (
        <div key={t.id}
          className={`flex items-center gap-3 rounded-xl border px-3.5 py-2.5 text-[13px] shadow-lg shadow-black/30 ${
            t.tone === 'error' ? 'border-red-500/40 bg-[#1b1416] text-red-200' : 'border-brand-green/40 bg-[#11161c] text-neutral-100'
          }`}>
          {t.tone === 'error'
            ? <AlertTriangle size={16} className="shrink-0 text-red-400" aria-hidden="true" />
            : <CheckCircle2 size={16} className="shrink-0 text-brand-green" aria-hidden="true" />}
          <span className="min-w-0 flex-1">{t.message}</span>
          {t.undo && (
            <button type="button" onClick={() => { t.undo(); toast.dismiss(t.id) }}
              className="shrink-0 rounded-md border border-white/15 px-2.5 py-1 text-[12px] font-medium text-white hover:border-white/40">
              Undo
            </button>
          )}
          <button type="button" onClick={() => toast.dismiss(t.id)} aria-label="Dismiss" className="shrink-0 rounded-md p-1 text-neutral-400 hover:text-white">
            <X size={14} aria-hidden="true" />
          </button>
        </div>
      ))}
    </div>
  )
}
