import { useMemo } from 'react'
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

export default function ChartsTab({ jobs, monthlyClaimsHistory, upcomingWork, onBack }) {
  const capacity = upcomingWork?.capacity

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

  // Straight off the workbook's own Total hours and Hours available rows
  // rather than recomputed here, so this chart and the Upcoming work table
  // can never disagree about the same month.
  const capacityByMonth = useMemo(() => {
    if (!capacity) return []
    return MONTH_LABELS.map((m) => {
      const planned = capacity.totalHours?.[m] ?? null
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
  }, [capacity])

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

  const biggestJobs = useMemo(
    () =>
      [...jobs]
        .filter((j) => j.totalActualCost)
        .sort((a, b) => b.totalActualCost - a.totalActualCost)
        .slice(0, 10)
        .map((j) => ({
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

  // Servicing + residential + commercial is exactly the sheet's Total Hours
  // row, so these three stack into the same number the capacity chart plots
  // — which is what makes a stacked area honest here rather than decorative.
  const workloadMix = useMemo(() => {
    if (!capacity) return []
    return MONTH_LABELS.map((m) => ({
      label: m,
      fullLabel: m,
      values: [
        capacity.servicingHours?.[m] ?? 0,
        capacity.residentialHours?.[m] ?? 0,
        capacity.commercialHours?.[m] ?? 0,
      ],
    }))
  }, [capacity])

  // Balance is planned minus available, as the sheet computes it: above the
  // line the month is short of people, below it there is room to sell.
  const balanceByMonth = useMemo(() => {
    if (!capacity) return []
    return MONTH_LABELS.map((m) => {
      const balance = capacity.balanceHours?.[m] ?? null
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
  }, [capacity])

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

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
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
          barLabel={(d, i) => compactMoney(d.values[i])}
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
          // Twelve months x two series is twenty-four labels, which is
          // wallpaper. Only the oversold months get one, because those are
          // the only ones the chart is making a point about.
          barLabel={(d, i) =>
            i === 0 && d.values[0] > d.values[1] ? compactHours(d.values[0]) : null
          }
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
        ]}
        footnote="The three bands add up to the Total hours row on the Upcoming Work sheet — the same number the capacity chart plots. Servicing is the sheet's flat monthly allowance for small jobs, which is why it is the one band that never stops."
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
          barLabel={(d) => (d.values[0] ? String(d.values[0]) : null)}
          height={200}
        />
      </ChartCard>

      <ChartCard
        title="The ten biggest jobs, spend against quote"
        question="Where is the money actually going, and is it staying inside the quote?"
        series={[{ name: 'Actual cost', color: SERIES_1 }, { name: 'Quoted cost', color: SERIES_2 }]}
        footnote="Ranked by what has been spent. A job whose actual bar is red has passed its quoted cost — the same test the Needs review count uses."
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
          emptyMessage="No job costs to rank yet."
        />
      </ChartCard>

      <ChartCard
        title="Delivered margin against quoted margin"
        question="Are jobs returning what they were sold for?"
        footnote={`Each dot is a job. The dashed line is "exactly as quoted" — anything below it is earning less than it was sold for, and ${behindQuote} of ${marginVsQuoted.length} jobs are. Both axes are the same scale, which is the only way the diagonal means anything.`}
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
          emptyMessage="No jobs with both a quoted and an actual margin."
        />
      </ChartCard>
    </div>
  )
}
