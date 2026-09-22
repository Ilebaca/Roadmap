import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useStore } from '../state/store'
import { BRAND_TEMPLATES } from '../lib/brandTemplates'
import { canCreate } from '../lib/permissions'
import { Plus, Trash, X } from './Icons'

/**
 * Brand Delivery System — the second app on the rail. Same shell as the
 * roadmap: a floating list on the left, one big panel on the right.
 *
 * The list is standardised: every client starts from the same template
 * catalogue, and an admin adjusts those categories (rename, rewrite, remove)
 * or adds their own. The categories are real rows; what goes *inside* them is
 * not built yet, so each one opens empty.
 */
export default function BrandDelivery() {
  const { session, project, brandSections, actions } = useStore()
  const [activeId, setActiveId] = useState(null)
  const [adding, setAdding] = useState(false)
  const admin = canCreate(session)

  const active = brandSections.find((s) => s.id === activeId) ?? brandSections[0] ?? null

  // Keep a valid selection as categories come and go, or the client changes.
  useEffect(() => {
    if (!brandSections.length) return setActiveId(null)
    if (!brandSections.some((s) => s.id === activeId)) setActiveId(brandSections[0].id)
  }, [brandSections, activeId])

  const used = new Set(brandSections.map((s) => s.template).filter(Boolean))
  const available = BRAND_TEMPLATES.filter((t) => !used.has(t.slug))

  return (
    <>
      <aside className="sidebar">
        <div className="sidebar-head">
          <span className="eyebrow">Brand system</span>
          <h2>{project?.name ?? '—'}</h2>
        </div>

        <nav className="phase-list">
          {brandSections.map((s) => (
            <div key={s.id} className="cat-row">
              <button
                className={`phase-tab ${s.id === active?.id ? 'is-active' : ''}`}
                onClick={() => setActiveId(s.id)}
              >
                <span className="phase-body">
                  <span className="phase-title">{s.title}</span>
                  <span className="phase-meta">{s.template ? 'Standard' : 'Custom'} · empty</span>
                </span>
              </button>
              {admin && (
                <button
                  className="icon-btn danger cat-remove"
                  onClick={() => actions.removeBrandSection(s.id)}
                  title={`Remove ${s.title}`}
                >
                  <Trash width="13" height="13" />
                </button>
              )}
            </div>
          ))}
        </nav>

        {admin &&
          (adding ? (
            <TemplatePicker
              available={available}
              onPick={async (tpl) => {
                setAdding(false)
                const row = await actions.addBrandSection(
                  tpl
                    ? { slug: tpl.slug, title: tpl.title, blurb: tpl.blurb, template: tpl.slug }
                    : { title: 'New category', blurb: '', template: null }
                )
                if (row) setActiveId(row.id)
              }}
              onCancel={() => setAdding(false)}
            />
          ) : (
            <button className="add-phase-btn" onClick={() => setAdding(true)}>
              <Plus width="14" height="14" /> Add category
            </button>
          ))}

        <p className="sidebar-foot">
          Every client starts from the same standard categories. Rename them, or add your own.
        </p>
      </aside>

      <main className="stage">
        <div className="brand-panel">
          {active ? (
            <BrandSection key={active.id} section={active} admin={admin} onPatch={actions.updateBrandSection} />
          ) : (
            <div className="brand-empty">
              <h3>No categories</h3>
              <p>{admin ? 'Add one from the standard set on the left.' : 'Nothing has been set up yet.'}</p>
            </div>
          )}
        </div>
      </main>
    </>
  )
}

/** One category: an adjustable heading and description over an empty shelf. */
function BrandSection({ section, admin, onPatch }) {
  const [title, setTitle] = useState(section.title)
  const [blurb, setBlurb] = useState(section.blurb)
  useEffect(() => setTitle(section.title), [section.title])
  useEffect(() => setBlurb(section.blurb), [section.blurb])

  return (
    <div className="brand-section">
      <header className="brand-head">
        {admin ? (
          <input
            className="brand-title-input"
            value={title}
            placeholder="Category name"
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => title !== section.title && onPatch(section.id, { title })}
            onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
          />
        ) : (
          <h2 className="brand-title">{section.title}</h2>
        )}

        {admin ? (
          <AutoGrow
            className="brand-blurb-input"
            value={blurb}
            placeholder="What belongs in this category…"
            onChange={setBlurb}
            onCommit={() => blurb !== section.blurb && onPatch(section.id, { blurb })}
          />
        ) : (
          <p className="brand-blurb">{section.blurb}</p>
        )}

        <span className={`pill ${section.template ? '' : 'pill-quiet'}`}>
          {section.template ? 'Standard category' : 'Custom category'}
        </span>
      </header>

      {/* Deliberately empty: the contents of a category are the next build.
          BACKEND: files land in Supabase Storage with a row in `brand_assets`
          pointing at them, scoped to this section_id. */}
      <div className="brand-shelf">
        <div className="brand-empty">
          <span className="brand-empty-note">Nothing here yet</span>
          <p>This category is set up and waiting for its contents.</p>
        </div>
      </div>
    </div>
  )
}

function TemplatePicker({ available, onPick, onCancel }) {
  return (
    <div className="tpl-picker">
      <div className="tpl-head">
        <span>Standard categories</span>
        <button className="icon-btn tiny" onClick={onCancel} title="Cancel">
          <X width="11" height="11" />
        </button>
      </div>
      {available.length ? (
        available.map((t) => (
          <button key={t.slug} className="tpl-option" onClick={() => onPick(t)}>
            {t.title}
          </button>
        ))
      ) : (
        <p className="tpl-none">All standard categories are in use.</p>
      )}
      <button className="tpl-option is-blank" onClick={() => onPick(null)}>
        <Plus width="11" height="11" /> Blank category
      </button>
    </div>
  )
}

function AutoGrow({ value, onChange, onCommit, className, placeholder }) {
  const ref = useRef(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [value])
  return (
    <textarea
      ref={ref}
      className={className}
      rows={1}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      onBlur={onCommit}
    />
  )
}
