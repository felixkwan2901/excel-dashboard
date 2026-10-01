import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, Download, Printer } from 'lucide-react'
import Logo from './Logo'
import { cents, money } from '../lib/format'
import { monthName, projectGpPerHour, projectProfit } from '../lib/completedJobPeople'
import { fetchJobCategories } from '../lib/jobCategoryStore'
import { buildMonthReport, downloadMonthReportExcel, TYPE_LABEL } from '../lib/monthReport'
import { word } from '../lib/words'

// One page you can hand to someone: the month's completed jobs summed up,
// by type of work, who did what, what went over quote, best and worst per
// hour. Print gives the PDF (A4 portrait); Excel gives the sheets behind it.
const gp = (v) => (v == null ? '—' : cents(v))
const PRINT_STYLE = '@page { size: A4 portrait; margin: 10mm; }'

function printReport() {
  const style = document.createElement('style')
  style.textContent = PRINT_STYLE
  document.head.appendChild(style)
  window.addEventListener('afterprint', () => style.remove(), { once: true })
  window.print()
}

function Figure({ label, value, sub }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-medium uppercase tracking-wide text-neutral-500 print:text-neutral-600">{label}</p>
      <p className="text-[20px] font-semibold tabular-nums leading-tight text-white print:text-black">{value}</p>
      {sub && <p className="text-[11px] tabular-nums text-neutral-500 print:text-neutral-600">{sub}</p>}
    </div>
  )
}

const TH = 'py-1 pr-2 text-left text-[10px] font-medium uppercase tracking-wide text-neutral-500 print:text-neutral-600'
const TD = 'py-1 pr-2 text-[11.5px] text-neutral-200 print:text-black'
const NUM = 'text-right tabular-nums'

export default function MonthReport({ completedJobs, onBack, initialMonth }) {
  const months = useMemo(() => [...new Set(completedJobs.map((j) => j.month).filter(Boolean))].sort().reverse(), [completedJobs])
  const [month, setMonth] = useState(initialMonth && months.includes(initialMonth) ? initialMonth : months[0])
  const [categories, setCategories] = useState(null)
  useEffect(() => {
    let live = true
    fetchJobCategories().then((c) => { if (live) setCategories(c ?? {}) }).catch(() => { if (live) setCategories({}) })
    return () => { live = false }
  }, [])
  const r = useMemo(() => (month ? buildMonthReport(completedJobs, categories, month) : null), [completedJobs, categories, month])
  const generated = new Intl.DateTimeFormat('en-NZ', { dateStyle: 'long' }).format(new Date())

  if (!r) return <p className="text-sm text-neutral-400">No completed jobs loaded yet — add a month in Update data → Completed jobs.</p>
  const delta = r.previous?.gp != null && r.all.gp != null ? r.all.gp - r.previous.gp : null

  return (
    <div className="mx-auto flex w-full max-w-[900px] flex-col gap-4 print:max-w-none">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <button onClick={onBack} className="flex items-center gap-1.5 rounded-full border border-white/10 px-3.5 py-1.5 text-sm text-neutral-300 hover:border-white/20 hover:text-white">
          <ArrowLeft size={14} aria-hidden="true" /> Back
        </button>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-[12px] text-neutral-500">
            Month
            <select value={month} onChange={(e) => setMonth(e.target.value)} className="rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1.5 text-[13px] font-medium text-white">
              {months.map((m) => <option key={m} value={m}>{monthName(m)}</option>)}
            </select>
          </label>
          <button onClick={() => downloadMonthReportExcel(r)} className="flex items-center gap-1.5 rounded-full border border-white/10 px-3.5 py-1.5 text-sm text-neutral-300 hover:border-white/20 hover:text-white">
            <Download size={14} aria-hidden="true" /> Excel
          </button>
          <button onClick={printReport} className="flex items-center gap-1.5 rounded-full bg-brand-green px-3.5 py-1.5 text-sm font-medium text-[#06210a] hover:bg-brand-green/90">
            <Printer size={14} aria-hidden="true" /> Print / PDF
          </button>
        </div>
      </div>

      <div className="month-report rounded-[18px] border border-white/[0.06] bg-[#11161c] p-6 print:border-none print:bg-white print:p-0 print:text-black">
        {/* header */}
        <div className="flex items-start justify-between gap-4 border-b border-white/10 pb-3 print:border-neutral-300">
          <div>
            <h1 className="text-[20px] font-bold text-white print:text-black">Completed jobs — {r.monthLabel}</h1>
            <p className="mt-0.5 text-[11px] text-neutral-400 print:text-neutral-600">
              Cassidy-Davies Electrical · {r.all.count} completed job{r.all.count === 1 ? '' : 's'} · printed {generated}
            </p>
          </div>
          <div className="print:text-black"><Logo /></div>
        </div>

        {/* headline figures */}
        <div className="mt-3 grid grid-cols-3 gap-3 sm:grid-cols-6">
          <Figure label={word('profitPerHour').replace('/hr', ' per hour')} value={r.all.gp == null ? '—' : `${cents(r.all.gp)}/hr`} sub={`${money(r.all.profit)} ÷ ${r.all.hours} h`} />
          <Figure label="Jobs" value={r.all.count} sub={`${r.chargeup.count} charge-up · ${r.quoted.count} quoted`} />
          <Figure label="Charge-up" value={r.chargeup.gp == null ? '—' : `${cents(r.chargeup.gp)}/hr`} sub={money(r.chargeup.profit)} />
          <Figure label="Quoted" value={r.quoted.gp == null ? '—' : `${cents(r.quoted.gp)}/hr`} sub={money(r.quoted.profit)} />
          <Figure label="Over quote" value={r.overQuote.length} sub="quoted jobs" />
          <Figure label={r.previousMonth ? `vs ${monthName(r.previousMonth, 'short')}` : 'Last month'}
            value={delta == null ? '—' : `${delta >= 0 ? '+' : '−'}${cents(Math.abs(delta))}/hr`}
            sub={r.previous ? `${gp(r.previous.gp)}/hr then` : 'no earlier month loaded'} />
        </div>

        <div className="mt-4 grid grid-cols-1 gap-5 sm:grid-cols-2 print:grid-cols-2">
          {/* by type of work */}
          <section>
            <h2 className="mb-1 text-[12px] font-semibold text-white print:text-black">By type of work</h2>
            <table className="w-full border-collapse">
              <thead><tr><th className={TH}>{word('typeOfWork')}</th><th className={`${TH} ${NUM}`}>Jobs</th><th className={`${TH} ${NUM}`}>Charge-up /hr</th><th className={`${TH} ${NUM}`}>Quoted /hr</th><th className={`${TH} ${NUM}`}>{word('profitPerHour')}</th></tr></thead>
              <tbody>
                {r.byType.map((t) => (
                  <tr key={t.cat} className="border-t border-white/[0.06] print:border-neutral-200">
                    <td className={`${TD} ${t.cat === 'Not set' ? 'text-amber-300 print:text-amber-700' : ''}`}>{t.cat}</td>
                    <td className={`${TD} ${NUM}`}>{t.n}</td>
                    <td className={`${TD} ${NUM}`}>{t.cuN ? gp(t.cuGp) : '—'}</td>
                    <td className={`${TD} ${NUM}`}>{t.qN ? gp(t.qGp) : '—'}</td>
                    <td className={`${TD} ${NUM} font-semibold`}>{gp(t.gp)}</td>
                  </tr>
                ))}
                <tr className="border-t border-white/20 font-semibold print:border-neutral-400">
                  <td className={TD}>All types of work</td><td className={`${TD} ${NUM}`}>{r.all.count}</td>
                  <td className={`${TD} ${NUM}`}>{gp(r.chargeup.gp)}</td><td className={`${TD} ${NUM}`}>{gp(r.quoted.gp)}</td><td className={`${TD} ${NUM}`}>{gp(r.all.gp)}</td>
                </tr>
              </tbody>
            </table>
          </section>

          {/* by person */}
          <section>
            <h2 className="mb-1 text-[12px] font-semibold text-white print:text-black">By person — quoted jobs</h2>
            {r.people.length === 0 ? <p className="text-[11.5px] text-neutral-500">No per-person hours this month.</p> : (
              <table className="w-full border-collapse">
                <thead><tr><th className={TH}>Person</th><th className={`${TH} ${NUM}`}>Jobs</th><th className={`${TH} ${NUM}`}>Hours</th><th className={`${TH} ${NUM}`}>{word('theirProfit')}</th>{r.previousMonth && <th className={`${TH} ${NUM}`}>vs {monthName(r.previousMonth, 'short')}</th>}</tr></thead>
                <tbody>
                  {r.people.map((p) => (
                    <tr key={p.name} className="border-t border-white/[0.06] print:border-neutral-200">
                      <td className={TD}>{p.name}</td>
                      <td className={`${TD} ${NUM}`}>{p.month.count}</td>
                      <td className={`${TD} ${NUM}`}>{p.month.hours}</td>
                      <td className={`${TD} ${NUM} font-semibold`}>{money(p.month.weightedGp)}</td>
                      {r.previousMonth && <td className={`${TD} ${NUM} ${p.flag ? 'font-semibold text-red-400 print:text-red-700' : ''}`}>{p.flag ? `down from ${money(p.flag.before)}` : '—'}</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          {/* over quote */}
          <section>
            <h2 className="mb-1 text-[12px] font-semibold text-white print:text-black">Over quote — {r.overQuote.length} quoted job{r.overQuote.length === 1 ? '' : 's'}</h2>
            {r.overQuote.length === 0 ? <p className="text-[11.5px] text-neutral-500">No quoted job came in over quote.</p> : (
              <table className="w-full border-collapse">
                <thead><tr><th className={TH}>Job</th><th className={TH}>What went over</th><th className={`${TH} ${NUM}`}>{word('profitPerHour')}</th></tr></thead>
                <tbody>
                  {r.overQuote.map(({ job, over }) => (
                    <tr key={job.jobNumber} className="border-t border-white/[0.06] print:border-neutral-200">
                      <td className={TD}><span className="text-neutral-400 print:text-neutral-600">{job.jobNumber}</span> {job.jobName}</td>
                      <td className={`${TD} text-red-300 print:text-red-700`}>{over.map((o) => (o.unit === 'h' ? `${o.label} ${o.quoted} → ${o.actual} h` : `${o.label} ${money(o.quoted)} → ${money(o.actual)}`)).join(' · ')}</td>
                      <td className={`${TD} ${NUM}`}>{gp(projectGpPerHour(job))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          {/* best and worst */}
          <section>
            <h2 className="mb-1 text-[12px] font-semibold text-white print:text-black">Best and worst per hour</h2>
            <table className="w-full border-collapse">
              <thead><tr><th className={TH}>Job</th><th className={TH}>{word('jobType')}</th><th className={`${TH} ${NUM}`}>Hours</th><th className={`${TH} ${NUM}`}>{word('profit')}</th><th className={`${TH} ${NUM}`}>{word('profitPerHour')}</th></tr></thead>
              <tbody>
                {[...r.best, ...(r.worst.filter((j) => !r.best.includes(j)))].map((j, i) => (
                  <tr key={j.jobNumber} className={`border-t print:border-neutral-200 ${i === r.best.length ? 'border-white/20 print:border-neutral-400' : 'border-white/[0.06]'}`}>
                    <td className={`${TD} max-w-[200px] truncate`}><span className="text-neutral-400 print:text-neutral-600">{j.jobNumber}</span> {j.jobName}</td>
                    <td className={`${TD} whitespace-nowrap`}>{TYPE_LABEL[j.type]}</td>
                    <td className={`${TD} ${NUM}`}>{j.hours}</td>
                    <td className={`${TD} ${NUM}`}>{money(projectProfit(j))}</td>
                    <td className={`${TD} ${NUM} font-semibold ${projectGpPerHour(j) < 0 ? 'text-red-400 print:text-red-700' : ''}`}>{gp(projectGpPerHour(j))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </div>

        <p className="mt-4 text-[10px] text-neutral-500 print:text-neutral-600">
          Profit per hour = profit (what the job sold for minus what it cost, from Katipolt&apos;s Profit &amp; Loss Summary) ÷ hours worked.
          {r.noHours > 0 && ` ${r.noHours} job${r.noHours === 1 ? ' has' : 's have'} no hours worked and no profit per hour.`}
          {r.untyped > 0 && ` ${r.untyped} job${r.untyped === 1 ? ' has' : 's have'} no type of work set.`}
          {' '}Margin % = profit as a share of what the job sold for.
        </p>
      </div>
    </div>
  )
}
