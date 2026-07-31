import CategoryCard from './CategoryCard'

export default function CategoryGrid({ categories, onSelect }) {
  return (
    <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
      {categories.map((cat, index) => (
        <CategoryCard key={cat.name} category={cat} index={index} onSelect={onSelect} />
      ))}
    </div>
  )
}
