// Plain words for every figure on the dashboard, used by every page so the
// same thing has the same name everywhere, with a one-line explanation for a
// tooltip. Change a label here and it changes on every screen.
//
//   word('profitPerHour')  → 'Profit/hr'    (column heading)
//   tip('profitPerHour')   → 'Gross profit … for every hour worked.'
export const WORDS = {
  jobNumber: { label: 'Job #', tip: 'The job’s number in Katipolt.' },
  jobName: { label: 'Job name' },
  jobType: { label: 'Job type', tip: 'Quoted: a fixed price was agreed up front. Charge-up: billed for the time and materials used.' },
  typeOfWork: { label: 'Type of work', tip: 'The kind of job — residential, commercial, solar and so on. Set it in the dropdown.' },
  owner: { label: 'Owner', tip: 'Who looks after this job.' },

  profitPerHour: { label: 'Profit/hr', long: 'Profit per hour', tip: 'Gross profit (what the job sold for minus what it cost) for every hour worked.' },
  quotedProfitPerHour: { label: 'Quoted profit/hr', tip: 'The profit per hour the quote allowed for.' },
  profit: { label: 'Profit', tip: 'What the job sold for minus what it cost, so far.' },
  quotedProfit: { label: 'Quoted profit', tip: 'The profit the quote allowed for.' },
  margin: { label: 'Margin %', tip: 'Profit as a share of what the job sold for. 20% means $20 of every $100 is profit.' },
  quotedMargin: { label: 'Quoted margin %', tip: 'The margin the quote allowed for.' },

  quotedHours: { label: 'Quoted hours', tip: 'Hours the quote allowed for. On a charge-up job: every hour booked, charged or not.' },
  hoursWorked: { label: 'Hours worked', tip: 'Hours booked to the job. On a charge-up job: the hours charged to the customer.' },
  hoursVsQuote: { label: 'Hours vs quote', tip: 'Quoted hours minus hours worked. Plus means under the quote, minus means over it.' },
  unsoldHours: { label: 'Unsold hours', tip: 'Hours booked to the job but not charged to the customer.' },
  hoursLeft: { label: 'Hours left', tip: 'Quoted hours minus hours worked so far.' },
  hoursPlanned: { label: 'Hours planned', tip: 'Hours pencilled in for the job, month by month.' },

  labourCost: { label: 'Labour cost', tip: 'What the hours on the job cost.' },
  totalCost: { label: 'Total cost', tip: 'Labour and materials together.' },
  quotedCost: { label: 'Quoted cost', tip: 'What the quote allowed the job to cost.' },
  actualCost: { label: 'Actual cost', tip: 'What the job has cost so far.' },

  retention: { label: 'Retention %', tip: 'The share of this month’s cost the customer holds back until the job is signed off.' },
  costsThisMonth: { label: 'Costs this month', tip: 'What the job has cost in this month.' },
  claimedThisMonth: { label: 'Claimed this month', tip: 'What has been invoiced for the job in this month.' },
  hoursToCome: { label: 'Hours still to do', tip: 'Your estimate of the hours left before the end of the month.' },
  costsToCome: { label: 'Costs still to come', tip: 'Your estimate of the costs left before the end of the month.' },
  monthTotalCost: { label: 'Total cost', tip: 'Costs this month plus what is still to come, including the profit on the labour and any retention.' },

  theirProfit: { label: 'Their profit', tip: 'Their share of the profit on each job, by the hours they put in, added up.' },
  personGpHour: { label: 'GP ($)', tip: 'Their share of the profit on each job, by the hours they put in, added up (quoted jobs only).' },
  shareOfTime: { label: 'Share of their time', tip: 'How much of their month went into this job.' },
}

export const word = (k) => WORDS[k]?.label ?? k
export const tip = (k) => WORDS[k]?.tip
