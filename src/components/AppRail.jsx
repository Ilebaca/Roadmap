import { BrandGlyph, RoadmapGlyph } from './Icons'

/**
 * The far-left rail: one icon per app. The selected one sits in a white box.
 * Roadmap is where work is scheduled and approved; the Brand Delivery System
 * is where the finished brand is handed over. Same shell, different contents.
 */
export const APPS = [
  { id: 'roadmap', label: 'Roadmap', Glyph: RoadmapGlyph },
  { id: 'brand', label: 'Brand Delivery System', Glyph: BrandGlyph }
]

export default function AppRail({ active, onSelect }) {
  return (
    <nav className="app-rail" aria-label="Apps">
      {APPS.map(({ id, label, Glyph }) => (
        <button
          key={id}
          className={`rail-btn ${id === active ? 'is-on' : ''}`}
          onClick={() => onSelect(id)}
          title={label}
          aria-label={label}
          aria-current={id === active ? 'page' : undefined}
        >
          <Glyph width="20" height="20" />
        </button>
      ))}
    </nav>
  )
}
