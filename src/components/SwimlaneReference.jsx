export default function SwimlaneReference({ data }) {
  return (
    <div className="reference-grid">
      {data.map((row) => (
        <div className="reference-card" key={row.number}>
          <div className="reference-card__header">
            <span className="reference-card__number">{row.number}</span>
            <div>
              <h3>{row.role}</h3>
              <span className="reference-card__type">{row.elementType}</span>
            </div>
          </div>
          <p>{row.responsibilities}</p>
          <span className="reference-card__integration">{row.integrationPoint}</span>
        </div>
      ))}
    </div>
  )
}
