import { RefreshCw } from 'lucide-react'
import SiteQrCode from './SiteQrCode'
import { fieldProgress, isStale, toHistoryRows, toTaskRows } from '../lib/fieldProgress'
import { formatRelativeTime } from '../lib/relativeTime'

// What the crew recorded on site, read-only.
//
// Displayed only, never fed into a derived figure. The Claims tab's
// "Est. % of job complete" comes from the workbook and drives
// projectedTotalCost (loadWorkbook.js) — wiring a number typed on a phone
// into that would quietly move every projected cost and margin in the app.
// The interesting output here is the *gap* between what has been claimed and
// what has been built, and that is for a person to read, not for a formula.
export default function FieldProgressTab({ state, onRefresh, jobNumber, jobName }) {
  if (state.status === 'loading') {
    return <p className="py-6 text-[13px] text-neutral-400">Loading field progress…</p>
  }

  if (state.status === 'error') {
    return (
      <div className="py-6">
        <p className="text-[13px] text-red-400">Couldn&apos;t reach the field data.</p>
        <RefreshButton onRefresh={onRefresh} />
      </div>
    )
  }

  const rows = toTaskRows(state.record, state.catalogue)
  const history = toHistoryRows(state.record, state.catalogue)

  if (rows.length === 0) {
    return (
      <div className="py-6">
        <p className="text-[13px] text-neutral-400">
          Nobody has recorded field progress for this job. The task list appears here once
          someone on site starts.
        </p>
        <RefreshButton onRefresh={onRefresh} asAt={state.asAt} />
        <SiteQrCode jobNumber={jobNumber} jobName={jobName} />
      </div>
    )
  }

  const progress = fieldProgress(rows)
  const stale = isStale(state.record?.updatedAt)

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-white/[0.06] pb-3">
        <p className="text-[13px] text-neutral-400">
          <span className="text-[15px] font-semibold text-white tabular-nums">
            {progress.percent}%
          </span>{' '}
          average across {progress.total} task{progress.total === 1 ? '' : 's'} ·{' '}
          {progress.started} started
        </p>
        {stale && (
          <span className="text-[12px] text-amber-400">
            Last updated {formatRelativeTime(state.record.updatedAt)}
          </span>
        )}
      </div>

      <ul>
        {rows.map((row) => (
          <li
            key={row.id}
            className="flex items-center gap-4 border-b border-white/[0.06] py-2.5 last:border-b-0"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] text-neutral-300">{row.label}</p>
              {row.by && (
                <p className="truncate text-[12px] text-neutral-500">
                  {row.by} · {formatRelativeTime(row.at)}
                </p>
              )}
            </div>
            <div className="hidden h-1.5 w-28 shrink-0 overflow-hidden rounded-full bg-white/[0.08] sm:block">
              <div
                className="h-full rounded-full bg-brand-green"
                style={{ width: `${row.na ? 0 : Math.max(0, Math.min(100, row.pct ?? 0))}%` }}
              />
            </div>
            <span className="w-12 shrink-0 text-right text-[14px] tabular-nums text-neutral-100">
              {row.na ? (
                <span className="text-[12px] text-neutral-500">N/A</span>
              ) : typeof row.pct === 'number' ? (
                `${row.pct}%`
              ) : (
                <span className="text-neutral-600">—</span>
              )}
            </span>
          </li>
        ))}
      </ul>

      {(state.record?.notes?.length ?? 0) > 0 && (
        <div className="mt-6 border-t border-white/[0.06] pt-5">
          <h3 className="text-[14px] font-medium text-neutral-100">Handover notes</h3>
          <p className="mt-1 text-[12px] text-neutral-400">
            Left by the crew for whoever is on site next. Read-only here.
          </p>
          <ul className="mt-3">
            {[...state.record.notes]
              .reverse()
              .slice(0, 6)
              .map((note, i) => (
                <li key={`${note.at}-${i}`} className="border-b border-white/[0.06] py-2.5 last:border-b-0">
                  <p className="text-[13px] leading-snug text-neutral-200">{note.text}</p>
                  <p className="mt-0.5 text-[12px] text-neutral-500">
                    {note.by} · {formatRelativeTime(note.at)}
                  </p>
                </li>
              ))}
          </ul>
          {state.record.notes.length > 6 && (
            <p className="mt-2 text-[12px] text-neutral-500">
              Showing the 6 most recent of {state.record.notes.length}.
            </p>
          )}
        </div>
      )}

      {history.length > 0 && (
        <div className="mt-6 border-t border-white/[0.06] pt-5">
          <h3 className="text-[14px] font-medium text-neutral-100">
            Change history
            <span className="ml-2 text-[12px] font-normal text-neutral-500">
              {history.length} change{history.length === 1 ? '' : 's'}
            </span>
          </h3>
          <p className="mt-1 text-[12px] text-neutral-400">
            Several people work one job, so who moved a figure and when is often the question.
            Recorded automatically and not editable from either app.
          </p>
          <ul className="mt-3">
            {/* Capped on screen. The record keeps the last 200 changes, and a
                job that has been running a while would otherwise push the QR
                code and everything else off the bottom of the tab. */}
            {history.slice(0, 12).map((entry) => (
              <li
                key={entry.key}
                className="flex items-baseline justify-between gap-4 border-b border-white/[0.06] py-2 last:border-b-0"
              >
                <span className="min-w-0 text-[13px] text-neutral-300">
                  <span className="text-neutral-100">{entry.by}</span> {entry.change} —{' '}
                  <span className="text-neutral-400">{entry.label}</span>
                </span>
                <span className="shrink-0 text-[12px] text-neutral-500">
                  {formatRelativeTime(entry.at)}
                </span>
              </li>
            ))}
          </ul>
          {history.length > 12 && (
            <p className="mt-2 text-[12px] text-neutral-500">
              Showing the 12 most recent of {history.length}.
            </p>
          )}
        </div>
      )}

      <RefreshButton onRefresh={onRefresh} asAt={state.asAt} />
      <SiteQrCode jobNumber={jobNumber} jobName={jobName} />
    </div>
  )
}

// A button rather than a poll. The field app writes whenever someone taps, so
// polling every open job page would mean a request every few seconds against
// an open, unauthenticated Worker — a good way to generate a surprise bill
// for information nobody is watching second by second.
function RefreshButton({ onRefresh, asAt }) {
  return (
    <div className="mt-4 flex items-center gap-3">
      <button
        onClick={onRefresh}
        className="flex items-center gap-1.5 rounded-md border border-white/10 px-2.5 py-1.5 text-[12px] text-neutral-300 transition-colors hover:border-brand-green/50 hover:text-brand-green"
      >
        <RefreshCw size={13} aria-hidden="true" />
        Refresh
      </button>
      {asAt && (
        <span className="text-[12px] text-neutral-500">
          As at {asAt.toLocaleTimeString('en-NZ', { hour: '2-digit', minute: '2-digit' })}
        </span>
      )}
    </div>
  )
}
