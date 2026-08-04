import { ArrowLeft, AlertTriangle } from 'lucide-react'
import StatusBadge from './StatusBadge'
import { money, percent } from '../lib/format'
import { statusReasons } from '../lib/statusReasons'

function Field({ label, children, warn }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[13px] font-medium text-neutral-500">{label}</span>
      <div className={`text-[15px] ${warn ? 'font-semibold text-amber-400' : 'text-neutral-100'}`}>
        {children}
      </div>
    </div>
  )
}

function Section({ title, children }) {
  return (
    <div className="mt-6 border-t border-white/10 pt-6">
      <h2 className="mb-4 text-[13px] font-semibold tracking-wide text-neutral-400 uppercase">
        {title}
      </h2>
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">{children}</div>
    </div>
  )
}

export default function ProjectDetail({ job, onBack }) {
  const reasons = statusReasons(job)

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <button
        onClick={onBack}
        className="flex w-fit items-center gap-1.5 rounded-full border border-white/10 px-3.5 py-1.5 text-sm text-neutral-300 transition-colors hover:border-white/20 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-green"
      >
        <ArrowLeft size={14} aria-hidden="true" />
        All jobs
      </button>

      <div className="rounded-[18px] border border-white/[0.06] bg-[#11161c] p-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm text-neutral-500 tabular-nums">Job {job.jobNumber}</p>
            <h1 className="mt-1 text-3xl font-bold text-white">{job.jobName}</h1>
            <div className="mt-2">
              <StatusBadge flagged={job.flagged} />
            </div>
          </div>
          <p className="text-3xl font-bold text-brand-green tabular-nums">
            {money(job.quotedPrice)}
          </p>
        </div>

        {job.flagged && reasons.length > 0 && (
          <div className="mt-5 flex items-start gap-3 rounded-xl border border-amber-400/30 bg-amber-400/[0.08] p-4">
            <AlertTriangle
              size={18}
              className="mt-0.5 shrink-0 text-amber-400"
              aria-hidden="true"
            />
            <div className="flex flex-col gap-1">
              <p className="text-[13px] font-semibold text-amber-400">Why this job is flagged</p>
              {reasons.map((reason) => (
                <p key={reason} className="text-[13px] text-neutral-200">
                  {reason}
                </p>
              ))}
            </div>
          </div>
        )}

        <Section title="Cost">
          <Field label="Total quoted">{money(job.totalQuotedCost)}</Field>
          <Field label="Total actual" warn={job.overBudget}>
            {money(job.totalActualCost)}
          </Field>
          <Field label="Materials (quoted / actual)">
            {money(job.quotedMaterialCost)} / {money(job.actualMaterialCost)}
          </Field>
          <Field label="Labour (quoted / actual)">
            {money(job.quotedLabourCost)} / {money(job.actualLabourCost)}
          </Field>
        </Section>

        <Section title="Labour hours">
          <Field label="Quoted hours">
            {job.quotedLabourHours === null ? '—' : job.quotedLabourHours}
          </Field>
          <Field label="Actual hours">
            {job.actualLabourHours === null ? '—' : job.actualLabourHours}
          </Field>
        </Section>

        <Section title="Claim progress">
          <Field label="Claim to date">{money(job.claimToDate)}</Field>
          <Field label="Remaining to claim">{money(job.remainingToClaim)}</Field>
          <Field label="% claim remaining">{percent(job.pctClaimRemaining)}</Field>
        </Section>

        <Section title="Margin">
          <Field label="Margin to date" warn={job.losingMargin}>
            {percent(job.marginToDate)}
          </Field>
          <Field label="Quoted margin">{percent(job.quotedMargin)}</Field>
          <Field label="GP $/hour">{money(job.gpPerHour)}</Field>
          <Field label="Quoted GP $/hour">{money(job.quotedGpPerHour)}</Field>
        </Section>
      </div>
    </div>
  )
}
