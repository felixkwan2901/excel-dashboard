function complianceTone(compliance) {
  if (compliance >= 0.95) return 'good'
  if (compliance >= 0.85) return 'warning'
  return 'critical'
}

export default function SwimlaneTable({ data }) {
  return (
    <div className="table-scroll">
      <table className="data-table">
        <thead>
          <tr>
            <th>Swimlane role</th>
            <th className="num">Active jobs</th>
            <th className="num">Avg cycle (hrs)</th>
            <th className="num">Target SLA (hrs)</th>
            <th className="num">Compliance</th>
          </tr>
        </thead>
        <tbody>
          {data.map((row) => (
            <tr key={row.name}>
              <td>{row.name}</td>
              <td className="num tabular">{row.activeCount}</td>
              <td className="num tabular">{row.avgCycleHrs.toFixed(1)}</td>
              <td className="num tabular">{row.targetSlaHrs.toFixed(1)}</td>
              <td className="num">
                <span className={`compliance-pill compliance-pill--${complianceTone(row.compliance)}`}>
                  {(row.compliance * 100).toFixed(0)}%
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
