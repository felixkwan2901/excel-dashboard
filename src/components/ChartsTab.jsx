import { useCallback, useMemo } from 'react'
import { money, percent, roundHours } from '../lib/format'
import ChartCard from './charts/ChartCard'
import BarChart from './charts/BarChart'
import HBarChart from './charts/HBarChart'
import LineChart from './charts/LineChart'
import ScatterChart from './charts/ScatterChart'
import { compactHours, compactMoney } from './charts/chartScale'

// Every figure on this page already exists somewhere in the dashboard. The
// point of drawing them is that a table answers "what is this number" and a
// chart answers "is this normal" — and the second question is the one you
// can't get from the other tabs without reading twelve columns and holding
// them in your head.
//
// Colours are the validated categorical slots 1 and 2 (blue, orange) — the
// pair is the standard colour-blind-safe opening because it separates on the
// blue-yellow axis, which every common form of colour blindness keeps. They
// are defined as tokens in index.css so light and dark each get their own
// step rather than one hex being reused on both grounds.
const SERIES_1 = 'var(--viz-1)'
const SERIES_2 = 'var(--viz-2)'
const SERIES_3 = 'var(--viz-3)'
const SERIES_4 = 'var(--viz-4)'
const CRITICAL = 'var(--viz-critical)'

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function monthShort(key) {
  const [y, m] = key.split('-')
  return `${MONTH_LABELS[Number(m) - 1]} ${y.slice(2)}`
}

function monthLong(key) {
  const [y, m] = key.split('-')
  return `${['January','February','March','April','May','June','July','August','September','October','November','December'][Number(m) - 1]} ${y}`
}

// Margin buckets. The edges are business thresholds, not round numbers: below
// zero is losing money, 0-10% is thin enough to be wiped out by one variation,
// and the quoted margins on this book sit around 20-26%, so 20%+ is "as sold".
const MARGIN_BUCKETS = [
  { label: '< 0%', short: '<0', test: (m) => m < 0, critical: true },
  { label: '0–10%', short: '0–10', test: (m) => m >= 0 && m < 0.1 },
  { label: '10–20%', short: '10–20', test: (m) => m >= 0.1 && m < 0.2 },
  { label: '20–30%', short: '20–30', test: (m) => m >= 0.2 && m < 0.3 },
  { label: '30%+', short: '30+', test: (m) => m >= 0.3 },
]

// Compact headline figures above the charts. Deliberately not the StatCard
// used on Projects: that one is 152px tall with a progress bar, which is
// right when three of them are the whole page and wrong when they are a strip
// above eight charts.
function KpiTile({ label, value, context, tone = 'neutral' }) {
  return (
    <div className="rounded-[14px] border border-white/[0.06] bg-[#11161c] p-4">
      <p className="text-[11px] font-medium tracking-wide text-neutral-400 uppercase">{label}</p>
      <p
        className={`mt-1 text-[24px] font-semibold tabular-nums ${
          tone === 'critical' ? 'text-red-400' : 'text-white'
        }`}
      >
        {value}
      </p>
      {context && <p className="mt-0.5 text-[12px] leading-snug text-neutral-400">{context}</p>}
    </div>
  )
}

// A quiet divider between the three questions this page answers: what the
// business billed, what the crew is committed to, and how the book is doing.
// Eight charts in one column with no grouping is a wall.
function SectionHeading({ children }) {
  return (
    <h2 className="mt-2 text-[12px] font-semibold tracking-wide text-neutral-400 uppercase">
      {children}
    </h2>
  )
}

export default function ChartsTab({ jobs, monthlyClaimsHistory, upcomingWork, onSelectJob, onBack }) {
  const capacity = upcomingWork?.capacity

  // Planned hours summed from the per-job rows, not read off the sheet's own
  // Total Hours row.
  //
  // Those rows are typed, not formulas, and they lag: as of this writing the
  // sheet says 1316 hours for October while the jobs underneath add up to
  // 1718. Jan-Sep agree exactly, which is what makes the rule clear —
  // servicing plus everything booked against a job IS the total, and the
  // stored row is just the last time someone recalculated it.
  const plannedByJob = useMemo(() => {
    const totals = {}
    for (const m of MONTH_LABELS) {
      totals[m] = (upcomingWork?.jobs ?? []).reduce((sum, job) => {
        const v = job.months?.[m]
        return sum + (typeof v === 'number' ? v : 0)
      }, 0)
    }
    return totals
  }, [upcomingWork])

  const plannedTotalFor = useCallback(
    (m) => (capacity?.servicingHours?.[m] ?? 0) + (plannedByJob[m] ?? 0),
    [capacity, plannedByJob],
  )

  const moneyByMonth = useMemo(
    () =>
      (monthlyClaimsHistory?.totalsByMonth ?? []).map((t) => ({
        label: monthShort(t.month),
        fullLabel: monthLong(t.month),
        values: [t.totalClaim, t.totalCosts],
        note:
          t.totalClaim - t.totalCosts < 0
            ? `${money(t.totalCosts - t.totalClaim)} more spent than claimed`
            : `${money(t.totalClaim - t.totalCosts)} ahead`,
      })),
    [monthlyClaimsHistory],
  )

  // Planned is servicing plus the per-job rows, exactly as the Upcoming work
  // table now computes it, so the two can never disagree about a month.
  const capacityByMonth = useMemo(() => {
    if (!capacity) return []
    return MONTH_LABELS.map((m) => {
      const planned = plannedTotalFor(m)
      const available = capacity.hoursAvailable?.[m] ?? null
      const short = planned !== null && available !== null && planned > available
      return {
        label: m,
        fullLabel: m,
        values: [planned, available],
        note: short
          ? `Short by ${roundHours(planned - available)} hrs`
          : planned !== null && available !== null
            ? `${roundHours(available - planned)} hrs spare`
            : null,
      }
    }).filter((d) => d.values.some((v) => v !== null && v !== 0))
  }, [capacity, plannedTotalFor])

  const marginSpread = useMemo(() => {
    const withMargin = jobs.filter((j) => j.marginToDate !== null)
    return MARGIN_BUCKETS.map((b) => {
      const inBucket = withMargin.filter((j) => b.test(j.marginToDate))
      return {
        label: b.label,
        shortLabel: b.short,
        fullLabel: `Margin ${b.label}`,
        critical: b.critical,
        values: [inBucket.length],
        note: inBucket.length
          ? inBucket
              .slice(0, 4)
              .map((j) => j.jobName)
              .join(', ') + (inBucket.length > 4 ? `, +${inBucket.length - 4} more` : '')
          : null,
      }
    })
  }, [jobs])

  // ---------------------------------------------------------------------
  // The four charts built on what Cassidy-Davies type in themselves — the
  // type of work and the owner. Nothing in the workbook records either, so
  // these are the only questions on this page that the spreadsheet cannot
  // already answer by being read down a column.
  //
  // They sit first because they are the ones that were asked for. The
  // workbook charts below still work; they answer "is this month normal",
  // which is a different question from "which kind of work should we be
  // chasing".
  // ---------------------------------------------------------------------

  const UNSET = 'Not set'

  // Grouped once, used by three of the four. A job with no category is kept
  // rather than dropped — "how much of this is uncategorised" is itself worth
  // seeing, and silently excluding it would make every total quietly wrong.
  const byCategory = useMemo(() => {
    const groups = new Map()
    for (const job of jobs) {
      const key = (job.jobCategory || '').trim() || UNSET
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key).push(job)
    }
    return [...groups].map(([label, list]) => ({ label, list }))
  }, [jobs])

  const sum = (list, field) =>
    list.reduce((total, job) => total + (typeof job[field] === 'number' ? job[field] : 0), 0)

  // A mean weighted by hours, not a mean of means: averaging each job's rate
  // lets a two-hour callout count the same as a nine-month build, which is
  // how a category with one good tiny job ends up looking like the most
  // profitable work the company does.
  const weightedRate = (list, rateField, hoursField) => {
    let hours = 0
    let value = 0
    for (const job of list) {
      const h = typeof job[hoursField] === 'number' ? job[hoursField] : 0
      const r = typeof job[rateField] === 'number' ? job[rateField] : null
      if (!h || r === null) continue
      hours += h
      value += r * h
    }
    return hours ? value / hours : null
  }

  const earningsByType = useMemo(
    () =>
      byCategory
        .map(({ label, list }) => ({
          label,
          fullLabel: label,
          jobs: list.length,
          values: [
            weightedRate(list, 'quotedGpPerHour', 'quotedLabourHours'),
            weightedRate(list, 'gpPerHour', 'actualLabourHours'),
          ],
        }))
        .filter((r) => r.values.some((v) => v !== null))
        .map((r) => ({ ...r, values: r.values.map((v) => v ?? 0) }))
        .sort((a, b) => b.values[0] - a.values[0]),
    [byCategory],
  )

  const costByType = useMemo(
    () =>
      byCategory
        .map(({ label, list }) => {
          const quoted = sum(list, 'totalQuotedCost')
          const actual = sum(list, 'totalActualCost')
          return {
            label,
            fullLabel: label,
            jobs: list.length,
            values: [actual, quoted],
            colors: [actual > quoted ? CRITICAL : SERIES_1, SERIES_2],
            note: actual > quoted ? 'Spent more than quoted' : null,
            ratio: quoted ? actual / quoted : null,
          }
        })
        .filter((r) => r.values[1] > 0)
        .sort((a, b) => (b.ratio ?? 0) - (a.ratio ?? 0)),
    [byCategory],
  )

  const byOwner = useMemo(() => {
    const groups = new Map()
    for (const job of jobs) {
      const key = (job.jobOwner || '').trim() || 'No owner'
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key).push(job)
    }
    return [...groups]
      .map(([label, list]) => ({
        label,
        fullLabel: label,
        jobs: list.length,
        values: [sum(list, 'quotedPrice')],
        // Unowned is a gap, not a person, so it reads as a state rather than
        // as one more name in the list.
        colors: [label === 'No owner' ? CRITICAL : SERIES_1],
        note: label === 'No owner' ? 'Nobody is named on these' : null,
      }))
      .sort((a, b) => b.values[0] - a.values[0])
  }, [jobs])

  const valueConcentration = useMemo(() => {
    const ranked = [...jobs]
      .filter((j) => typeof j.quotedPrice === 'number' && j.quotedPrice > 0)
      .sort((a, b) => b.quotedPrice - a.quotedPrice)
    const total = ranked.reduce((t, j) => t + j.quotedPrice, 0)
    const shareOf = (n) =>
      total ? ranked.slice(0, n).reduce((t, j) => t + j.quotedPrice, 0) / total : 0
    return {
      total,
      count: ranked.length,
      topThree: shareOf(3),
      topTen: shareOf(10),
      rows: ranked.slice(0, 10).map((j) => ({
        jobNumber: j.jobNumber,
        label: j.jobName.length > 20 ? `${j.jobName.slice(0, 19)}…` : j.jobName,
        fullLabel: `${j.jobNumber} ${j.jobName}`,
        values: [j.quotedPrice],
        note: (j.jobCategory || '').trim() || 'No type set',
      })),
    }
  }, [jobs])

  const biggestJobs = useMemo(
    () =>
      [...jobs]
        .filter((j) => j.totalActualCost)
        .sort((a, b) => b.totalActualCost - a.totalActualCost)
        .slice(0, 10)
        .map((j) => ({
          jobNumber: j.jobNumber,
          label: j.jobName.length > 20 ? `${j.jobName.slice(0, 19)}…` : j.jobName,
          fullLabel: `${j.jobNumber} ${j.jobName}`,
          values: [j.totalActualCost, j.totalQuotedCost],
          // Over quote is a state, not a series, so it gets the status colour
          // and the tooltip says so in words — never colour on its own.
          colors: [j.overBudget ? CRITICAL : SERIES_1, SERIES_2],
          note: j.overBudget ? 'Over quoted cost' : null,
        })),
    [jobs],
  )

  // The bands add up to the same planned total the capacity chart plots,
  // which is what makes a stacked area honest here rather than decorative.
  //
  // The fourth band exists because the sheet's Residential and Commercial
  // rows are typed and lag the per-job plan — October's split accounts for
  // 616 of 1018 planned hours. Rather than quietly show a short total, the
  // remainder is its own band: the work is planned, nobody has said which
  // kind it is yet.
  const workloadMix = useMemo(() => {
    if (!capacity) return []
    return MONTH_LABELS.map((m) => {
      const residential = capacity.residentialHours?.[m] ?? 0
      const commercial = capacity.commercialHours?.[m] ?? 0
      const unsplit = Math.max(0, (plannedByJob[m] ?? 0) - residential - commercial)
      return {
        label: m,
        fullLabel: m,
        values: [capacity.servicingHours?.[m] ?? 0, residential, commercial, unsplit],
      }
    })
  }, [capacity, plannedByJob])

  // Planned minus available, computed from the corrected planned figure
  // rather than read off the sheet's Balance row, which inherits the same lag
  // as the Total Hours row it is derived from.
  const balanceByMonth = useMemo(() => {
    if (!capacity) return []
    return MONTH_LABELS.map((m) => {
      const available = capacity.hoursAvailable?.[m]
      const balance =
        available === null || available === undefined ? null : plannedTotalFor(m) - available
      return {
        label: m,
        fullLabel: m,
        values: [balance],
        note:
          balance === null
            ? null
            : balance > 0
              ? 'More work planned than crew to do it'
              : 'Room to take on more',
      }
    }).filter((d) => d.values[0] !== null)
  }, [capacity, plannedTotalFor])

  // How much of a month's billing comes from how few jobs. Plotted as a
  // cumulative share against job rank: the faster the line climbs, the more
  // the month depends on a handful of jobs going right.
  const concentration = useMemo(() => {
    const history = monthlyClaimsHistory?.totalsByMonth ?? []
    // The current month is deliberately excluded — it is a few days old and
    // its two or three claims would draw a near-vertical line implying a
    // concentration that is really just an unfinished month.
    const months = history.slice(0, -1).map((t) => t.month)
    if (months.length === 0) return { points: [], series: [] }

    const perMonth = months.map((month) => {
      const claims = (monthlyClaimsHistory.jobs ?? [])
        .map((j) => j.claimByMonth[month] ?? 0)
        .filter((c) => c > 0)
        .sort((a, b) => b - a)
      const total = claims.reduce((sum, c) => sum + c, 0)
      let running = 0
      return { month, total, curve: claims.map((c) => ((running += c) / total) * 100) }
    })

    const longest = Math.max(...perMonth.map((m) => m.curve.length))
    const points = Array.from({ length: longest }, (_, i) => ({
      label: String(i + 1),
      fullLabel: `Top ${i + 1} job${i === 0 ? '' : 's'}`,
      values: perMonth.map((m) => (i < m.curve.length ? Math.round(m.curve[i]) : 100)),
    }))
    return {
      points,
      series: perMonth.map((m, i) => ({
        name: monthLong(m.month).split(' ')[0],
        color: i === 0 ? SERIES_1 : SERIES_2,
      })),
    }
  }, [monthlyClaimsHistory])

  // Quoted margin against what the job is actually returning. Same units on
  // both axes, so the dashed diagonal is "exactly as quoted" and everything
  // below it is a job earning less than it was sold for.
  const marginVsQuoted = useMemo(
    () =>
      jobs
        .filter((j) => j.marginToDate !== null && j.quotedMargin !== null && j.quotedMargin !== 0)
        .map((j) => ({
          jobNumber: j.jobNumber,
          label: j.jobName,
          fullLabel: `${j.jobNumber} ${j.jobName}`,
          x: j.quotedMargin * 100,
          y: j.marginToDate * 100,
          under: j.marginToDate < j.quotedMargin,
          note:
            j.marginToDate < j.quotedMargin
              ? `${percent(j.quotedMargin - j.marginToDate)} below quote`
              : `${percent(j.marginToDate - j.quotedMargin)} above quote`,
        })),
    [jobs],
  )

  const behindQuote = marginVsQuoted.filter((p) => p.under).length

  const lastMonth = moneyByMonth[moneyByMonth.length - 1]

  // The last month with a full set of figures, not the current one — on the
  // 10th, "this month" is three claims and reads like a collapse.
  const lastFullMonth = moneyByMonth.length > 1 ? moneyByMonth[moneyByMonth.length - 2] : null
  const oversoldMonths = balanceByMonth.filter((d) => d.values[0] > 0)
  const totalQuoted = jobs.reduce((sum, j) => sum + (j.quotedPrice ?? 0), 0)
  const flaggedCount = jobs.filter((j) => j.flagged).length
  const openJob = (jobNumber) => {
    const job = jobs.find((j) => j.jobNumber === jobNumber)
    if (job && onSelectJob) onSelectJob(job)
  }

  return (
    <div className="mx-auto flex w-full max-w-[1800px] flex-col gap-6">
      <nav className="flex items-center gap-1.5 text-sm text-text-muted">
        <button className="transition-colors hover:text-text-primary" onClick={onBack}>
          Operations overview
        </button>
        <span aria-hidden="true">/</span>
        <span className="text-text-primary">Dashboard</span>
      </nav>

      <div>
        <h1 className="text-2xl font-semibold text-white">Dashboard</h1>
        <p className="mt-1 text-sm text-neutral-400">
          The same figures the other tabs carry, drawn so you can see the shape of them. Hover
          anything for the exact numbers; on a phone the figures are printed on the charts.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <KpiTile label="Active jobs" value={jobs.length} context={`${money(totalQuoted)} quoted`} />
        <KpiTile
          label="Needs review"
          value={flaggedCount}
          tone={flaggedCount > 0 ? 'critical' : 'neutral'}
          context="Cost projected over quote"
        />
        <KpiTile
          label="Behind quote"
          value={`${behindQuote} of ${marginVsQuoted.length}`}
          context="Jobs earning less than sold for"
        />
        <KpiTile
          label={lastFullMonth ? `${lastFullMonth.fullLabel.split(' ')[0]} profit` : 'Last month'}
          value={lastFullMonth ? money(lastFullMonth.values[0] - lastFullMonth.values[1]) : '—'}
          tone={lastFullMonth && lastFullMonth.values[0] < lastFullMonth.values[1] ? 'critical' : 'neutral'}
          context={lastFullMonth ? `${money(lastFullMonth.values[0])} claimed` : undefined}
        />
        <KpiTile
          label="Months oversold"
          value={oversoldMonths.length}
          tone={oversoldMonths.length > 0 ? 'critical' : 'neutral'}
          context={
            oversoldMonths.length ? oversoldMonths.map((m) => m.label).join(', ') : 'Capacity is fine'
          }
        />
      </div>

      <SectionHeading>Type of work and ownership</SectionHeading>

      <ChartCard
        title="What each kind of work earns an hour"
        question="Which work should we be chasing?"
        series={[
          { name: 'Quoted GP/hr', color: SERIES_2 },
          { name: 'Actual GP/hr', color: SERIES_1 },
        ]}
        footnote="Gross profit per labour hour, which is the one measure that compares a two-hour callout with a nine-month build. Both figures are weighted by hours rather than averaged per job, so one small very profitable job cannot make a whole category look like the best work in the company. A shorter actual bar than quoted means that kind of work is not delivering what it was priced at. Type of work is typed in on the Projects tab — it is not in the workbook."
        table={
          <table>
            <caption>Quoted and actual gross profit per hour, by type of work</caption>
            <tbody>
              {earningsByType.map((r) => (
                <tr key={r.label}>
                  <th scope="row">{r.label}</th>
                  <td>{r.jobs} job{r.jobs === 1 ? '' : 's'}</td>
                  <td>Quoted {money(r.values[0])}/hr</td>
                  <td>Actual {money(r.values[1])}/hr</td>
                </tr>
              ))}
            </tbody>
          </table>
        }
      >
        <HBarChart
          rows={earningsByType}
          series={[
            { name: 'Quoted GP/hr', color: SERIES_2 },
            { name: 'Actual GP/hr', color: SERIES_1 },
          ]}
          labelWidth={170}
          valueFormat={(v) => `${money(v)}/hr`}
          axisFormat={compactMoney}
          emptyMessage="No jobs have a type of work set yet. Set one on the Projects tab."
        />
      </ChartCard>

      <ChartCard
        title="Which kind of work runs over"
        question="Do we underprice a whole category, or just the odd job?"
        series={[
          { name: 'Actual cost', color: SERIES_1 },
          { name: 'Quoted cost', color: SERIES_2 },
        ]}
        footnote="Every job of that type added together. A longer actual bar than quoted means the category as a whole is spending more than it was priced at — which is a pricing problem, not a bad week on one site. Sorted by how far over each type is running."
        table={
          <table>
            <caption>Actual against quoted cost, by type of work</caption>
            <tbody>
              {costByType.map((r) => (
                <tr key={r.label}>
                  <th scope="row">{r.label}</th>
                  <td>{r.jobs} job{r.jobs === 1 ? '' : 's'}</td>
                  <td>Actual {money(r.values[0])}</td>
                  <td>Quoted {money(r.values[1])}</td>
                  <td>{r.ratio === null ? '—' : `${Math.round(r.ratio * 100)}% of quote`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        }
      >
        <HBarChart
          rows={costByType}
          series={[
            { name: 'Actual cost', color: SERIES_1 },
            { name: 'Quoted cost', color: SERIES_2 },
          ]}
          labelWidth={170}
          valueFormat={money}
          axisFormat={compactMoney}
          emptyMessage="No jobs have a type of work set yet."
        />
      </ChartCard>

      <ChartCard
        title="Who is carrying what"
        question="Is one person holding most of the money?"
        footnote="Quoted value of the jobs each person is named on. The owner is typed in on the Projects tab, so anything nobody has been named on shows as “No owner” rather than being left out — on this data that band is usually the largest one, which is the finding rather than a gap in the chart."
        table={
          <table>
            <caption>Quoted value by job owner</caption>
            <tbody>
              {byOwner.map((r) => (
                <tr key={r.label}>
                  <th scope="row">{r.label}</th>
                  <td>{r.jobs} job{r.jobs === 1 ? '' : 's'}</td>
                  <td>{money(r.values[0])}</td>
                </tr>
              ))}
            </tbody>
          </table>
        }
      >
        <HBarChart
          rows={byOwner}
          series={[{ name: 'Quoted value', color: SERIES_1 }]}
          labelWidth={150}
          valueFormat={money}
          axisFormat={compactMoney}
          emptyMessage="No jobs to group."
        />
      </ChartCard>

      <ChartCard
        title="Where the money sits"
        question="How exposed are we if one job goes wrong?"
        footnote={`The ten biggest jobs by quoted value. The top three are ${percent(valueConcentration.topThree)} of everything quoted and the top ten are ${percent(valueConcentration.topTen)}, across ${valueConcentration.count} jobs — so a problem on one of these is not the same size of problem as one anywhere else. Each bar is labelled with its type of work. Click a bar to open the job.`}
        table={
          <table>
            <caption>The ten biggest jobs by quoted value</caption>
            <tbody>
              {valueConcentration.rows.map((r) => (
                <tr key={r.fullLabel}>
                  <th scope="row">{r.fullLabel}</th>
                  <td>{r.note}</td>
                  <td>{money(r.values[0])}</td>
                </tr>
              ))}
            </tbody>
          </table>
        }
      >
        <HBarChart
          rows={valueConcentration.rows}
          series={[{ name: 'Quoted value', color: SERIES_1 }]}
          labelWidth={150}
          valueFormat={money}
          axisFormat={compactMoney}
          onSelect={(r) => openJob(r.jobNumber)}
          emptyMessage="No jobs with a quoted value."
        />
      </ChartCard>

      <SectionHeading>Billing</SectionHeading>

      <ChartCard
        title="Claimed against costs, by month"
        question="Is the business billing more than it is spending?"
        series={[{ name: 'Claimed', color: SERIES_1 }, { name: 'Costs', color: SERIES_2 }]}
        footnote={
          lastMonth
            ? `Only the months since this logging began are shown — ${moneyByMonth.length} so far. A month where the orange bar is taller was a month that cost more than it billed.`
            : undefined
        }
        table={
          <table>
            <caption>Claimed and costs by month</caption>
            <tbody>
              {moneyByMonth.map((d) => (
                <tr key={d.label}>
                  <th scope="row">{d.fullLabel}</th>
                  <td>Claimed {money(d.values[0])}</td>
                  <td>Costs {money(d.values[1])}</td>
                </tr>
              ))}
            </tbody>
          </table>
        }
      >
        <BarChart
          data={moneyByMonth}
          series={[{ name: 'Claimed', color: SERIES_1 }, { name: 'Costs', color: SERIES_2 }]}
          valueFormat={money}
          axisFormat={compactMoney}
          emptyMessage="No month-by-month claims logged yet."
        />
      </ChartCard>

      <ChartCard
        title="How much of a month rides on a few jobs"
        question="If one big job slips, how much of the month goes with it?"
        series={concentration.series}
        footnote="Jobs ranked biggest claim first, then added up. The steeper the climb, the more of that month's billing sat with a handful of jobs. The current month is left out — it is only a few days old."
        table={
          <table>
            <caption>Cumulative share of each month&apos;s claim by job rank</caption>
            <tbody>
              {concentration.points.map((d) => (
                <tr key={d.label}>
                  <th scope="row">{d.fullLabel}</th>
                  {d.values.map((v, i) => (
                    <td key={i}>
                      {concentration.series[i].name} {v}%
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        }
      >
        <LineChart
          points={concentration.points}
          series={concentration.series}
          mode="line"
          valueFormat={(v) => `${v}% of the month`}
          axisFormat={(v) => `${v}%`}
          height={230}
          emptyMessage="Needs a completed month of claims before this means anything."
        />
      </ChartCard>

      <SectionHeading>The year ahead</SectionHeading>

      <ChartCard
        title="Planned hours against capacity"
        question="Which months are the crew already oversold in?"
        series={[{ name: 'Hours planned', color: SERIES_1 }, { name: 'Hours available', color: SERIES_2 }]}
        footnote="Both rows come straight from the Upcoming Work sheet, so this and the Upcoming work table always agree. A month where planned overtops available is a month that needs more people or a moved date."
        table={
          <table>
            <caption>Planned hours and available hours by month</caption>
            <tbody>
              {capacityByMonth.map((d) => (
                <tr key={d.label}>
                  <th scope="row">{d.label}</th>
                  <td>Planned {d.values[0] ?? '—'}</td>
                  <td>Available {d.values[1] ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        }
      >
        <BarChart
          data={capacityByMonth}
          series={[{ name: 'Hours planned', color: SERIES_1 }, { name: 'Hours available', color: SERIES_2 }]}
          valueFormat={(v) => `${roundHours(v)} hrs`}
          axisFormat={compactHours}
          emptyMessage="No capacity figures on the Upcoming Work sheet."
        />
      </ChartCard>

      <ChartCard
        title="What the hours are actually for"
        question="Is the year commercial work, houses, or servicing?"
        series={[
          { name: 'Servicing', color: SERIES_1 },
          { name: 'Residential', color: SERIES_2 },
          { name: 'Commercial', color: SERIES_3 },
          { name: 'Not yet split', color: SERIES_4 },
        ]}
        footnote="The bands add up to the same planned total the capacity chart plots. Servicing is the sheet's flat monthly allowance for small jobs, which is why it is the one band that never stops. “Not yet split” is work booked against a job that the sheet's residential/commercial rows haven't caught up with — those rows are typed by hand, so they lag the per-job plan."
        table={
          <table>
            <caption>Servicing, residential and commercial hours by month</caption>
            <tbody>
              {workloadMix.map((d) => (
                <tr key={d.label}>
                  <th scope="row">{d.label}</th>
                  <td>Servicing {d.values[0]}</td>
                  <td>Residential {d.values[1]}</td>
                  <td>Commercial {d.values[2]}</td>
                  <td>Not yet split {d.values[3]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        }
      >
        <LineChart
          points={workloadMix}
          series={[
            { name: 'Servicing', color: SERIES_1 },
            { name: 'Residential', color: SERIES_2 },
            { name: 'Commercial', color: SERIES_3 },
            { name: 'Not yet split', color: SERIES_4 },
          ]}
          mode="stack"
          valueFormat={(v) => `${roundHours(v)} hrs`}
          axisFormat={compactHours}
          emptyMessage="No workload split on the Upcoming Work sheet."
        />
      </ChartCard>

      <ChartCard
        title="Short or spare, month by month"
        question="Which way is each month leaning?"
        series={[{ name: 'Balance', aboveColor: CRITICAL, belowColor: SERIES_1 }]}
        footnote="Planned hours minus available hours, straight off the sheet's Balance row. Above the line the month needs more people than the crew has; below it there is room to sell more work."
        table={
          <table>
            <caption>Capacity balance by month, planned hours minus available</caption>
            <tbody>
              {balanceByMonth.map((d) => (
                <tr key={d.label}>
                  <th scope="row">{d.label}</th>
                  <td>
                    {d.values[0] > 0 ? 'Short by ' : 'Spare '}
                    {roundHours(Math.abs(d.values[0]))} hrs
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        }
      >
        <LineChart
          points={balanceByMonth}
          series={[{ name: 'Balance', aboveColor: CRITICAL, belowColor: SERIES_1 }]}
          mode="zero"
          aboveLabel="Short by"
          belowLabel="Spare"
          valueFormat={(v) => `${roundHours(Math.abs(v))} hrs`}
          axisFormat={compactHours}
          height={220}
          emptyMessage="No balance row on the Upcoming Work sheet."
        />
      </ChartCard>

      <SectionHeading>The book</SectionHeading>

      <ChartCard
        title="Where the jobs sit on margin"
        question="Is the book healthy, or is it one or two good jobs carrying the rest?"
        series={[{ name: 'Jobs', color: SERIES_1 }]}
        footnote="One bar per band, counting active jobs by margin to date. Red is the band that is losing money."
        table={
          <table>
            <caption>Number of active jobs in each margin band</caption>
            <tbody>
              {marginSpread.map((d) => (
                <tr key={d.label}>
                  <th scope="row">{d.label}</th>
                  <td>{d.values[0]} jobs</td>
                </tr>
              ))}
            </tbody>
          </table>
        }
      >
        <BarChart
          data={marginSpread}
          series={[{ name: 'Jobs', color: SERIES_1 }]}
          valueFormat={(v) => `${v} job${v === 1 ? '' : 's'}`}
          axisFormat={(v) => String(v)}
          colorFor={(d) => (d.critical ? CRITICAL : SERIES_1)}
          height={200}
        />
      </ChartCard>

      <ChartCard
        title="The ten biggest jobs, spend against quote"
        question="Where is the money actually going, and is it staying inside the quote?"
        series={[{ name: 'Actual cost', color: SERIES_1 }, { name: 'Quoted cost', color: SERIES_2 }]}
        footnote="Ranked by what has been spent. A job whose actual bar is red has passed its quoted cost — the same test the Needs review count uses. Click a row to open the job."
        table={
          <table>
            <caption>Actual cost against quoted cost for the ten biggest jobs</caption>
            <tbody>
              {biggestJobs.map((d) => (
                <tr key={d.fullLabel}>
                  <th scope="row">{d.fullLabel}</th>
                  <td>Actual {money(d.values[0])}</td>
                  <td>Quoted {money(d.values[1])}</td>
                </tr>
              ))}
            </tbody>
          </table>
        }
      >
        <HBarChart
          rows={biggestJobs}
          series={[{ name: 'Actual cost', color: SERIES_1 }, { name: 'Quoted cost', color: SERIES_2 }]}
          valueFormat={money}
          axisFormat={compactMoney}
          onSelect={(r) => openJob(r.jobNumber)}
          emptyMessage="No job costs to rank yet."
        />
      </ChartCard>

      <ChartCard
        title="Delivered margin against quoted margin"
        question="Are jobs returning what they were sold for?"
        footnote={`Each dot is a job. The dashed line is "exactly as quoted" — anything below it is earning less than it was sold for, and ${behindQuote} of ${marginVsQuoted.length} jobs are. Both axes are the same scale, which is the only way the diagonal means anything. Click a dot to open the job.`}
        table={
          <table>
            <caption>Quoted margin against margin to date, per job</caption>
            <tbody>
              {marginVsQuoted.map((p) => (
                <tr key={p.fullLabel}>
                  <th scope="row">{p.fullLabel}</th>
                  <td>Quoted {p.x.toFixed(1)}%</td>
                  <td>To date {p.y.toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        }
      >
        <ScatterChart
          points={marginVsQuoted}
          xLabel="Quoted margin"
          yLabel="Margin to date"
          format={(v) => `${Math.round(v)}%`}
          colorFor={(p) => (p.under ? CRITICAL : SERIES_1)}
          onSelect={(p) => openJob(p.jobNumber)}
          emptyMessage="No jobs with both a quoted and an actual margin."
        />
      </ChartCard>
    </div>
  )
}
