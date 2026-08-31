import { Plus, Search, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import {
  circuitComponentCatalog,
  type CircuitComponentCategory,
  type CircuitComponentInstance,
  type CircuitComponentType,
} from '../circuit'

const categories: CircuitComponentCategory[] = ['Basic', 'Sensors', 'Outputs', 'Prototyping', 'Power']

type ComponentCatalogProps = {
  components: CircuitComponentInstance[]
  onAdd: (id: CircuitComponentType) => void
  onClose: () => void
}

export function ComponentCatalog({ components, onAdd, onClose }: ComponentCatalogProps) {
  const [query, setQuery] = useState('')
  const normalizedQuery = query.trim().toLowerCase()
  const filteredComponents = useMemo(
    () => circuitComponentCatalog.filter((component) => (
      !normalizedQuery || `${component.id} ${component.name} ${component.description} ${component.category}`.toLowerCase().includes(normalizedQuery)
    )),
    [normalizedQuery],
  )

  return (
    <aside className="component-catalog" aria-label="Component catalog" onKeyDown={(event) => {
      if (event.key === 'Escape') onClose()
    }}>
      <header>
        <strong>Add component</strong>
        <button type="button" title="Close component catalog" onClick={onClose}><X /></button>
      </header>
      <label className="component-search">
        <Search aria-hidden="true" />
        <input
          autoFocus
          type="search"
          value={query}
          placeholder="Search components"
          aria-label="Search components"
          onChange={(event) => setQuery(event.target.value)}
        />
      </label>
      <div className="component-catalog-list">
        {categories.map((category) => {
          const categoryComponents = filteredComponents.filter((component) => component.category === category)
          if (!categoryComponents.length) return null
          return (
            <section className="component-catalog-group" key={category}>
              <h3>{category}</h3>
              {categoryComponents.map((component) => {
                const count = components.filter((instance) => instance.type === component.id).length
                return (
                  <button
                    type="button"
                    className="component-catalog-item"
                    data-catalog-id={component.id}
                    key={component.id}
                    onClick={() => onAdd(component.id)}
                  >
                    <ComponentPreview id={component.id} />
                    <span><strong>{component.name}</strong><small>{component.description}</small></span>
                    <em><Plus />{count ? `${count} placed` : 'Add'}</em>
                  </button>
                )
              })}
            </section>
          )
        })}
        {!filteredComponents.length && <p className="component-catalog-empty">No components found</p>}
      </div>
    </aside>
  )
}

function ComponentPreview({ id }: { id: CircuitComponentType }) {
  return (
    <span className={`component-preview ${id}`} aria-hidden="true">
      {id === 'led' && <wokwi-led value color="red" />}
      {id === 'button' && <wokwi-pushbutton color="green" />}
      {id === 'potentiometer' && <wokwi-potentiometer min={0} max={1023} value={512} />}
      {id === 'photoresistor' && <wokwi-photoresistor-sensor ledPower />}
      {id === 'ultrasonic' && <wokwi-hc-sr04 />}
      {id === 'buzzer' && <wokwi-buzzer />}
      {id === 'servo' && <wokwi-servo angle={90} horn="single" />}
      {id === 'ws2812b' && <i className="ws2812b-preview">{Array.from({ length: 8 }, (_, index) => <b key={index} />)}</i>}
      {id === 'resistor' && <i className="resistor-preview"><span /></i>}
      {id === 'battery' && <i className="battery-preview"><span>9V</span></i>}
      {id === 'breadboard' && <i className="breadboard-preview"><span /><span /><span /></i>}
    </span>
  )
}
