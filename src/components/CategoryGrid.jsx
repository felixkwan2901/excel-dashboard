export default function CategoryGrid({ categories, onSelect }) {
  return (
    <div className="category-grid">
      {categories.map((cat) => (
        <button key={cat.name} className="category-tile" onClick={() => onSelect(cat.name)}>
          <span className="category-tile__name">{cat.name}</span>
          <span className="category-tile__count">{cat.jobCount} jobs</span>
          <span className="category-tile__arrow" aria-hidden="true">
            →
          </span>
        </button>
      ))}
    </div>
  )
}
