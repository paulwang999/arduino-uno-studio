import { BookOpen, FileCode2, Search, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { exampleCategories, examples } from '../examples'

type ExampleLibraryProps = {
  onOpen: (id: string) => void
  onClose: () => void
}

export function ExampleLibrary({ onOpen, onClose }: ExampleLibraryProps) {
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('All examples')
  const searchRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    searchRef.current?.focus()
    function closeWithEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', closeWithEscape)
    return () => window.removeEventListener('keydown', closeWithEscape)
  }, [onClose])

  const categoryCounts = useMemo(() => new Map(exampleCategories.map((name) => [
    name,
    examples.filter((example) => example.category === name).length,
  ])), [])

  const filteredExamples = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    return examples.filter((example) => {
      if (category !== 'All examples' && example.category !== category) return false
      if (!normalizedQuery) return true
      return `${example.name} ${example.category} ${example.collection} ${example.code}`.toLowerCase().includes(normalizedQuery)
    })
  }, [category, query])

  return <>
    <button className="example-library-backdrop" type="button" aria-label="Close example library" onClick={onClose} />
    <section className="example-library" role="dialog" aria-modal="true" aria-label="Arduino Example Library">
      <header>
        <div><BookOpen aria-hidden="true" /><strong>Arduino Example Library</strong><span>{examples.length} examples</span></div>
        <button type="button" title="Close example library" onClick={onClose}><X /></button>
      </header>
      <label className="example-search">
        <Search aria-hidden="true" />
        <input ref={searchRef} value={query} placeholder="Search examples or code" onChange={(event) => setQuery(event.target.value)} />
      </label>
      <div className="example-library-body">
        <nav className="example-categories" aria-label="Example categories">
          <button type="button" className={category === 'All examples' ? 'active' : ''} onClick={() => setCategory('All examples')}>
            <span>All examples</span><small>{examples.length}</small>
          </button>
          {exampleCategories.map((name) => <button type="button" key={name} className={category === name ? 'active' : ''} onClick={() => setCategory(name)}>
            <span>{name}</span><small>{categoryCounts.get(name)}</small>
          </button>)}
        </nav>
        <div className="example-results" aria-live="polite">
          <div className="example-results-heading"><strong>{category}</strong><span>{filteredExamples.length} shown</span></div>
          {filteredExamples.map((example) => <button className="example-row" type="button" key={example.id} data-example-id={example.id} onClick={() => onOpen(example.id)}>
            <FileCode2 aria-hidden="true" />
            <span><strong>{example.name}</strong><small>{example.collection}</small></span>
            <em className={example.compatibility === 'uno' ? 'uno' : ''}>{example.compatibility === 'uno' ? 'UNO' : 'BOARD-SPECIFIC'}</em>
          </button>)}
          {filteredExamples.length === 0 && <p className="example-empty">No examples match this search.</p>}
        </div>
      </div>
    </section>
  </>
}
