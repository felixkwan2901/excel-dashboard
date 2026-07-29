export default function CompanyList({ companies, onSelect }) {
  return (
    <ul className="company-list">
      {companies.map((company) => (
        <li key={company.name}>
          <button className="company-row" onClick={() => onSelect(company.name)}>
            <span className="company-row__name">{company.name}</span>
            <span className="company-row__count">{company.jobCount} projects</span>
            <span className="company-row__arrow" aria-hidden="true">
              →
            </span>
          </button>
        </li>
      ))}
    </ul>
  )
}
