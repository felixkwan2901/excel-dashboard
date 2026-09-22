import { useCallback, useMemo } from 'react'
import { money, percent, roundHours } from '../lib/format'
import ChartCard from './charts/ChartCard'
import BarChart from './charts/BarChart'
import HBarChart from './charts/HBarChart'
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

// Compact headline figures above the charts. Deliberately not the StatCard
// used on Projects: that one is 152px tall with a progress bar, which is
// right when three of them are the whole page and wrong when they are a strip
// above eight charts.

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

  // The bands add up to the same planned total the capacity chart plots,
  // which is what makes a stacked area honest here rather than decorative.
  //
  // The fourth band exists because the sheet's Residential and Commercial
  // rows are typed and lag the per-job plan — October's split accounts for
  // 616 of 1018 planned hours. Rather than quietly show a short total, the
  // remainder is its own band: the work is planned, nobody has said which
  // kind it is yet.

  // Planned minus available, computed from the corrected planned figure
  // rather than read off the sheet's Balance row, which inherits the same lag
  // as the Total Hours row it is derived from.

  // How much of a month's billing comes from how few jobs. Plotted as a
  // cumulative share against job rank: the faster the line climbs, the more
  // the month depends on a handful of jobs going right.

  // Quoted margin against what the job is actually returning. Same units on
  // both axes, so the dashed diagonal is "exactly as quoted" and everything
  // below it is a job earning less than it was sold for.

  const lastMonth = moneyByMonth[moneyByMonth.length - 1]

  // The last month with a full set of figures, not the current one — on the
  // 10th, "this month" is three claims and reads like a collapse.
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
          Mostly the things you type in yourselves — the type of work and the owner — which no
          other tab can show you, because the workbook does not record them. Hover anything for
          the exact numbers; on a phone the figures are printed on the charts.
        </p>
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

    </div>
  )
}
