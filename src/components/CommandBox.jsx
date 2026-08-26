import { useRef, useState } from 'react'
import { Sparkles } from 'lucide-react'
import { saveEdit } from '../lib/saveEdit'
import {
  ONBOARDING_ITEMS,
  LINK_ITEM_COUNTS,
  isLinkedChecklistCompleteFromRecord,
  fetchLinkedChecklistRecord,
} from '../lib/onboardingChecklist'

const UPLOAD_WORKER_URL = 'https://cde-data-upload.fkw24.workers.dev'

// Same col numbers MonthlyClaims.jsx's EDITABLE_FIELDS already uses —
// duplicated here rather than imported since that array is local to that
// component; kept in sync manually (these columns essentially never change).
const CLAIM_CALC_FIELDS = [
  { col: 5, label: 'Retention %' },
  { col: 8, label: 'Hours to complete before E.O.M' },
  { col: 9, label: 'Costs to come before E.O.M' },
  { col: 16, label: 'Notes' },
]

// Same col numbers UpcomingWorkTab.jsx's MONTH_FIELDS/NOTES_COL use.
const UPCOMING_WORK_FIELDS = [
  { col: 5, label: 'Jan' }, { col: 6, label: 'Feb' }, { col: 7, label: 'Mar' },
  { col: 8, label: 'Apr' }, { col: 9, label: 'May' }, { col: 10, label: 'Jun' },
  { col: 11, label: 'Jul' }, { col: 12, label: 'Aug' }, { col: 13, label: 'Sep' },
  { col: 14, label: 'Oct' }, { col: 15, label: 'Nov' }, { col: 16, label: 'Dec' },
  { col: 18, label: 'Notes' },
]

// Only ever proposes an action for the user to confirm — the actual save
// goes through the exact same saveEdit() the manual UI already uses, so
// there's exactly one code path that ever writes anything. See the plan
// at dreamy-brewing-truffle.md for the full design/safety rationale.
export default function CommandBox({ jobs, mainSheetColumns }) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [parsing, setParsing] = useState(false)
  const [result, setResult] = useState(null) // { ambiguous, reason, candidates } | { action } | { error }
  const [saveStatus, setSaveStatus] = useState({ kind: 'idle', message: '' })
  const inputRef = useRef(null)

  function reset() {
    setText('')
    setResult(null)
    setSaveStatus({ kind: 'idle', message: '' })
  }

  async function handleSubmit(e) {
    e.preventDefault()
    const trimmed = text.trim()
    if (!trimmed || parsing) return

    setParsing(true)
    setResult(null)
    setSaveStatus({ kind: 'idle', message: '' })

    try {
      const res = await fetch(`${UPLOAD_WORKER_URL}/command`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          text: trimmed,
          jobs: jobs.map((j) => ({ jobNumber: j.jobNumber, jobName: j.jobName })),
          mainSheetColumns,
          claimCalcFields: CLAIM_CALC_FIELDS,
          upcomingWorkFields: UPCOMING_WORK_FIELDS,
        }),
      })
      const payload = await res.json()
      if (!res.ok || !payload.ok) {
        setResult({ error: payload.message ?? `Request failed (${res.status}).` })
        return
      }
      if (payload.ambiguous) {
        setResult({ ambiguous: true, reason: payload.reason, candidates: payload.candidates ?? [] })
        return
      }
      setResult({ action: payload.action })
    } catch (err) {
      setResult({ error: `Could not reach the AI service: ${String(err.message ?? err)}` })
    } finally {
      setParsing(false)
    }
  }

  // Same guard MainSheetTab.jsx applies for items 18/19 — the command box
  // can't be used to route around it.
  async function gateError(action) {
    if (action.target !== 'main-sheet' || action.value !== 'Yes') return null
    const colIndex = mainSheetColumns.findIndex((c) => c.col === action.col)
    const item = colIndex >= 0 ? ONBOARDING_ITEMS[colIndex] : null
    if (!item?.link) return null
    const record = await fetchLinkedChecklistRecord(item.link, action.jobNumber)
    if (isLinkedChecklistCompleteFromRecord(item.link, record)) return null
    const sheetName = item.link === 'weekly' ? 'Weekly Job Check Sheet' : 'Job Completion Checklist'
    return `Finish all ${LINK_ITEM_COUNTS[item.link]} items on the ${sheetName} first.`
  }

  async function handleConfirm() {
    const { action } = result
    setSaveStatus({ kind: 'idle', message: 'Checking…' })
    const blocked = await gateError(action)
    if (blocked) {
      setSaveStatus({ kind: 'error', message: blocked })
      return
    }

    setSaveStatus({ kind: 'idle', message: 'Saving…' })
    const saveResult = await saveEdit(action.target, action.jobNumber, action.col, action.value)
    if (saveResult.status === 'done') {
      setSaveStatus({ kind: 'ok', message: `${saveResult.message ?? 'Saved.'}` })
    } else {
      setSaveStatus({ kind: 'error', message: saveResult.message })
    }
  }

  return (
    <div className="fixed bottom-5 right-5 z-30">
      {open && (
        <div className="mb-2 w-80 rounded-[16px] border border-white/10 bg-[#11161c] p-4 shadow-2xl shadow-black/40">
          <p className="mb-2 text-[13px] font-medium text-neutral-100">Tell it what to change</p>
          <form onSubmit={handleSubmit} className="flex gap-2">
            <input
              ref={inputRef}
              type="text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder='e.g. "set retention to 5% for 8142"'
              maxLength={300}
              disabled={parsing}
              className="w-full min-w-0 rounded-md border border-white/10 bg-white/[0.04] px-2.5 py-1.5 text-[13px] text-neutral-200 focus:border-brand-green/50 focus:outline-none disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={parsing || !text.trim()}
              className="shrink-0 rounded-md border border-brand-green/40 bg-brand-green/10 px-3 py-1.5 text-[13px] font-medium text-brand-green transition-colors hover:bg-brand-green/20 disabled:opacity-50"
            >
              {parsing ? '…' : 'Go'}
            </button>
          </form>

          {result?.error && <p className="mt-3 text-[13px] text-red-400">{result.error}</p>}

          {result?.ambiguous && (
            <div className="mt-3 rounded-[10px] border border-amber-400/30 bg-amber-400/[0.06] p-3">
              <p className="text-[13px] text-amber-300">{result.reason ?? "Not sure what you meant — try being more specific."}</p>
              {result.candidates.length > 0 && (
                <ul className="mt-1.5 list-disc pl-4 text-[12px] text-neutral-400">
                  {result.candidates.map((c, i) => (
                    <li key={i}>{c}</li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {result?.action && (
            <div className="mt-3 rounded-[10px] border border-white/10 bg-white/[0.03] p-3">
              <p className="text-[13px] text-neutral-200">{result.action.humanSummary}</p>
              {saveStatus.message && (
                <p className={`mt-2 text-[12px] ${saveStatus.kind === 'error' ? 'text-red-400' : 'text-brand-green'}`}>
                  {saveStatus.message}
                </p>
              )}
              {saveStatus.kind !== 'ok' && (
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    onClick={handleConfirm}
                    className="rounded-md border border-brand-green/40 bg-brand-green/10 px-3 py-1 text-[12px] font-medium text-brand-green transition-colors hover:bg-brand-green/20"
                  >
                    Confirm
                  </button>
                  <button
                    type="button"
                    onClick={reset}
                    className="rounded-md border border-white/10 px-3 py-1 text-[12px] text-neutral-400 transition-colors hover:text-white"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>
          )}

          <p className="mt-3 text-[11px] text-neutral-500">
            Every change still needs your confirmation, saves instantly the same way the manual boxes do (the
            workbook itself catches up in the background), and only covers the Job checklist, Monthly claims, and
            Upcoming work.
          </p>
        </div>
      )}

      <button
        type="button"
        onClick={() => {
          setOpen((v) => !v)
          if (!open) setTimeout(() => inputRef.current?.focus(), 0)
        }}
        aria-label="Open the AI command box"
        aria-expanded={open}
        className={`flex h-11 w-11 items-center justify-center rounded-full border shadow-lg shadow-black/30 transition-colors ${
          open
            ? 'border-brand-green/50 bg-brand-green/15 text-brand-green'
            : 'border-white/10 bg-[#11161c] text-neutral-300 hover:border-white/20 hover:text-white'
        }`}
      >
        <Sparkles size={18} aria-hidden="true" />
      </button>
    </div>
  )
}
