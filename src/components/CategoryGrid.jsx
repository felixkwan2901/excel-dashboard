import CategoryCard from './CategoryCard'

export default function CategoryGrid({ categories, onSelect }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      {categories.map((cat, i) => (
        <CategoryCard key={cat.name} category={cat} index={i} onSelect={onSelect} size="compact" />
      ))}
    </div>
  )
}
