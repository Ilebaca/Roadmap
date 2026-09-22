import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useStore } from '../state/store'
import { BRAND_TEMPLATES } from '../lib/brandTemplates'
import { canCreate } from '../lib/permissions'
import { Plus, Trash, X } from './Icons'
import BrandContent from './BrandContent'
import ConfirmDialog from './ConfirmDialog'

/**
 * Visual Identity — the second app on the rail. Same shell as the roadmap: a floating list on the left, one big panel on the right.
 *
 * The list is standardised: every client starts from the same template
 * catalogue, and an admin adjusts those categories (rename, rewrite, remove)
 * or adds their own. The categories are real rows; what goes *inside* them is
 * not built yet, so each one opens empty.
 */
export default function BrandDelivery() {
  const store = useStore()
  const { session, project, brandSections, actions } = store
  const [activeId, setActiveId] = useState(null)
  const [adding, setAdding] = useState(false)
  const [pendingCat, setPendingCat] = useState(null)
  const [notice, setNotice] = useState(null)
  const admin = canCreate(session)

  const active = brandSections.find((s) => s.id === activeId) ?? brandSections[0] ?? null

  // An upload that will not fit in browser storage says so, then clears.
  useEffect(() => {
    if (!notice) return
    const id = setTimeout(() => setNotice(null), 6000)
    return () => clearTimeout(id)
  }, [notice])

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
          <span className="eyebrow">Visual Identity</span>
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
                  <span className="phase-meta">{countLabel(store.assetsFor(s.id).length)}</span>
                </span>
              </button>
              {admin && (
                <button
                  className="icon-btn danger cat-remove"
                  onClick={() => setPendingCat(s)}
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
            <BrandSection
              key={active.id}
              section={active}
              assets={store.assetsFor(active.id)}
              admin={admin}
              actions={actions}
              onPatch={actions.updateBrandSection}
              onError={setNotice}
            />
          ) : (
            <div className="brand-empty">
              <h3>No categories</h3>
              <p>{admin ? 'Add one from the standard set on the left.' : 'Nothing has been set up yet.'}</p>
            </div>
          )}
        </div>
      </main>

      {pendingCat && (
        <ConfirmDialog
          title={`Delete "${pendingCat.title}"?`}
          body={
            store.assetsFor(pendingCat.id).length
              ? `Everything in it goes too — ${countLabel(store.assetsFor(pendingCat.id).length)}. This cannot be undone.`
              : 'This cannot be undone.'
          }
          confirmLabel="Delete category"
          onCancel={() => setPendingCat(null)}
          onConfirm={() => {
            actions.removeBrandSection(pendingCat.id)
            setPendingCat(null)
          }}
        />
      )}

      {notice && (
        <div className="toast" onClick={() => setNotice(null)} role="status">
          {notice}
        </div>
      )}
    </>
  )
}

const countLabel = (n) => (n ? `${n} item${n > 1 ? 's' : ''}` : 'Empty')

/** One category: an adjustable heading and description over an empty shelf. */
function BrandSection({ section, assets, admin, actions, onPatch, onError }) {
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
      </header>

      <BrandContent
        section={section}
        assets={assets}
        admin={admin}
        actions={actions}
        onError={onError}
      />
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
