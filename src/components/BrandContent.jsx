import { useLayoutEffect, useRef, useState } from 'react'
import { formatBytes, hostOf, checkSize, withProtocol } from '../lib/files'
import {
  ArrowUp,
  Download,
  GridGlyph,
  GripGlyph,
  HeadingGlyph,
  ImageGlyph,
  Link as LinkIcon,
  TextGlyph,
  Trash,
  X,
  ZipGlyph
} from './Icons'
import ConfirmDialog from './ConfirmDialog'

/**
 * The contents of a Visual Identity category.
 *
 * Ordinary categories hold a single ordered column of text and images; an admin
 * adds, edits, reorders and removes them, and anyone can download an image.
 *
 * The Downloadables category is different: it is a grid of boxes, each one
 * either a file to download (a zip of the assets) or a link out to somewhere
 * the work already lives.
 */
export default function BrandContent({ section, assets, admin, actions, onError }) {
  const downloads = section.template === 'downloadables'
  const [pending, setPending] = useState(null) // asset waiting on a confirm
  // Images that belong to a grid hang off it; only the rest form the column.
  const top = assets.filter((a) => !a.parent_id)

  // Drag a block by its grip to put it somewhere else in the column. The row
  // being dragged and the gap it would land in are both tracked here.
  const [dragId, setDragId] = useState(null)
  const [over, setOver] = useState(null) // { id, where: 'before' | 'after' }

  const endDrag = () => {
    setDragId(null)
    setOver(null)
  }

  const dropIt = () => {
    if (!dragId || !over || dragId === over.id) return endDrag()
    const ids = top.map((a) => a.id).filter((id) => id !== dragId)
    const at = ids.indexOf(over.id) + (over.where === 'after' ? 1 : 0)
    ids.splice(at, 0, dragId)
    actions.reorderBrandAssets(section.id, ids)
    endDrag()
  }

  const remove = (asset) => setPending(asset)

  /** Make a grid two or three across by adding or taking away a trailing cell. */
  const setCells = async (grid, n) => {
    const cells = assets.filter((a) => a.parent_id === grid.id)
    if (n === cells.length) return
    if (n > cells.length) {
      for (let i = cells.length; i < n; i++) {
        await actions.addBrandAsset({ section_id: section.id, kind: 'image', parent_id: grid.id })
      }
      return
    }
    // Taking one away never throws work out without asking.
    const doomed = cells.slice(n)
    if (doomed.some((c) => c.url || c.body)) return setPending(doomed.at(-1))
    for (const c of doomed) await actions.removeBrandAsset(c.id)
  }

  const move = (asset, direction) => actions.moveBrandAsset(asset.id, direction)

  const addFile = async (file, kind, parent_id = null, intoCell = null) => {
    if (!file) return
    try {
      checkSize(file)
      // Filling a cell that is already there, rather than adding a new one.
      if (intoCell) return await actions.updateBrandAsset(intoCell, { kind: 'image', file })
      await actions.addBrandAsset({
        section_id: section.id,
        kind,
        parent_id,
        // A zip in Downloadables is named; an image is not.
        title: kind === 'image' ? null : file.name.replace(/\.[^.]+$/, ''),
        file
      })
    } catch (e) {
      onError(e.message)
    }
  }

  const body = downloads ? (
    <DownloadGrid
      section={section}
      assets={assets}
      admin={admin}
      actions={actions}
      onAddFile={(f) => addFile(f, 'file')}
      onRemove={remove}
      onMove={move}
    />
  ) : (
    <div className="asset-list">
      {top.map((a, i) => (
        <AssetRow
          key={a.id}
          asset={a}
          dragging={dragId === a.id}
          dropHint={over?.id === a.id && dragId && dragId !== a.id ? over.where : null}
          onDragStart={() => setDragId(a.id)}
          onDragEnd={endDrag}
          onDragOverRow={(where) => setOver({ id: a.id, where })}
          onDropRow={dropIt}
          images={a.kind === 'grid' ? assets.filter((x) => x.parent_id === a.id) : []}
          admin={admin}
          first={i === 0}
          last={i === top.length - 1}
          actions={actions}
          onAddImage={(file, intoCell) => addFile(file, 'image', a.id, intoCell)}
          onSetCells={(n) => setCells(a, n)}
          onRemove={() => remove(a)}
          onRemoveChild={(child) => remove(child)}
          onMove={(d) => move(a, d)}
        />
      ))}

      {!top.length && (
        <div className="brand-empty">
          <span className="brand-empty-note">Nothing here yet</span>
          <p>{admin ? 'Add some text or an image to start this category off.' : 'This category is waiting for its contents.'}</p>
        </div>
      )}
    </div>
  )

  return (
    <div className="brand-shelf">
      {body}

      {admin && !downloads && (
        <div className="asset-add">
          <button
            className="add-chip"
            onClick={() =>
              actions.addBrandAsset({ section_id: section.id, kind: 'heading', title: '', size: 'm' })
            }
          >
            <HeadingGlyph width="13" height="13" /> Add headline
          </button>
          <button
            className="add-chip"
            onClick={() => actions.addBrandAsset({ section_id: section.id, kind: 'paragraph', body: '' })}
          >
            <TextGlyph width="13" height="13" /> Add paragraph
          </button>
          <label className="add-chip">
            <ImageGlyph width="13" height="13" /> Add image
            <input
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => {
                addFile(e.target.files?.[0], 'image')
                e.target.value = ''
              }}
            />
          </label>
          {[2, 3].map((n) => (
            <button
              key={n}
              className="add-chip"
              onClick={() => actions.addGrid(section.id, n)}
            >
              <GridGlyph width="13" height="13" cols={n} /> Grid of {n}
            </button>
          ))}
        </div>
      )}

      {pending && (
        <ConfirmDialog
          title={`Delete "${pending.title || 'this item'}"?`}
          body="This cannot be undone."
          onCancel={() => setPending(null)}
          onConfirm={() => {
            // The last cell of a grid takes the grid with it — deleting the
            // grid cascades to the cell, so that is the one call to make.
            const lastCell =
              pending.parent_id && assets.filter((a) => a.parent_id === pending.parent_id).length === 1
            actions.removeBrandAsset(lastCell ? pending.parent_id : pending.id)
            setPending(null)
          }}
        />
      )}
    </div>
  )
}

/* -------------------------------------------------------------------------- */

function AssetRow({
  asset,
  images = [],
  admin,
  first,
  last,
  actions,
  onAddImage,
  onSetCells,
  onRemove,
  onRemoveChild,
  onMove,
  dragging,
  dropHint,
  onDragStart,
  onDragEnd,
  onDragOverRow,
  onDropRow
}) {
  const rowRef = useRef(null)
  // A text block holds a heading part, a paragraph part, or both. null means
  // the part is not there; '' means it is there and empty.
  const isText = asset.kind === 'heading' || asset.kind === 'paragraph' || asset.kind === 'text'
  const hasHeading = isText && asset.title !== null && asset.title !== undefined
  const hasBody = isText && asset.body !== null && asset.body !== undefined

  return (
    <article
      ref={rowRef}
      className={`asset asset-${asset.kind} ${dragging ? 'is-dragging' : ''} ${dropHint ? `drop-${dropHint}` : ''}`}
      onDragOver={(e) => {
        if (!admin) return
        e.preventDefault()
        const r = rowRef.current.getBoundingClientRect()
        onDragOverRow(e.clientY < r.top + r.height / 2 ? 'before' : 'after')
      }}
      onDrop={(e) => {
        if (!admin) return
        e.preventDefault()
        onDropRow()
      }}
    >
      {admin && (
        <div className="asset-tools">
          {/* Drag this block somewhere else in the column. */}
          <button
            className="icon-btn tiny grip"
            draggable
            onDragStart={(e) => {
              e.dataTransfer.effectAllowed = 'move'
              e.dataTransfer.setData('text/plain', asset.id)
              if (rowRef.current) e.dataTransfer.setDragImage(rowRef.current, 20, 20)
              onDragStart()
            }}
            onDragEnd={onDragEnd}
            title="Drag to reorder"
          >
            <GripGlyph width="13" height="13" />
          </button>

          {/* Add the other half to this block: a heading over the text, or
              text under the heading. They stay one block either way. */}
          {isText && !hasHeading && (
            <button
              className="icon-btn tiny"
              onClick={() => actions.updateBrandAsset(asset.id, { title: '', size: asset.size ?? 'm' })}
              title="Add a heading to this block"
            >
              <HeadingGlyph width="13" height="13" />
            </button>
          )}
          {isText && !hasBody && (
            <button
              className="icon-btn tiny"
              onClick={() => actions.updateBrandAsset(asset.id, { body: '' })}
              title="Add text under the heading"
            >
              <TextGlyph width="13" height="13" />
            </button>
          )}

          {/* Headlines come in three sizes. */}
          {hasHeading && (
            <div className="size-pick" role="group" aria-label="Headline size">
              {['s', 'm', 'l'].map((sz) => (
                <button
                  key={sz}
                  className={(asset.size ?? 'm') === sz ? 'is-on' : ''}
                  onClick={() => actions.updateBrandAsset(asset.id, { size: sz })}
                  title={{ s: 'Small', m: 'Medium', l: 'Large' }[sz]}
                >
                  {sz.toUpperCase()}
                </button>
              ))}
            </div>
          )}

          {/* Two or three across — the number of cells in the grid. */}
          {asset.kind === 'grid' && (
            <div className="size-pick" role="group" aria-label="Cells across">
              {[2, 3].map((n) => (
                <button
                  key={n}
                  className={images.length === n ? 'is-on' : ''}
                  onClick={() => onSetCells(n)}
                  title={`${n} across`}
                >
                  {n}
                </button>
              ))}
            </div>
          )}
          <button className="icon-btn tiny" disabled={first} onClick={() => onMove('up')} title="Move up">
            <ArrowUp width="13" height="13" />
          </button>
          <button className="icon-btn tiny flip" disabled={last} onClick={() => onMove('down')} title="Move down">
            <ArrowUp width="13" height="13" />
          </button>
          <button className="icon-btn tiny danger" onClick={onRemove} title="Remove">
            <Trash width="13" height="13" />
          </button>
        </div>
      )}

      {/* A text block carries a heading, a paragraph, or both — whichever
          parts are present. An image is just the image. */}
      {hasHeading &&
        (admin ? (
          <input
            className={`asset-h-input size-${asset.size ?? 'm'}`}
            defaultValue={asset.title ?? ''}
            placeholder="Headline"
            onBlur={(e) =>
              e.target.value !== asset.title && actions.updateBrandAsset(asset.id, { title: e.target.value })
            }
            onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
          />
        ) : (
          asset.title && <h3 className={`asset-h size-${asset.size ?? 'm'}`}>{asset.title}</h3>
        ))}

      {hasBody &&
        (admin ? (
          <AutoGrow
            className="asset-body-input"
            defaultValue={asset.body ?? ''}
            placeholder="Write here…"
            onCommit={(v) => v !== asset.body && actions.updateBrandAsset(asset.id, { body: v })}
          />
        ) : (
          asset.body && <p className="asset-body">{asset.body}</p>
        ))}

      {asset.kind === 'grid' && (
        <ImageGrid
          grid={asset}
          cells={images}
          admin={admin}
          actions={actions}
          onAddImage={onAddImage}
          onRemoveChild={onRemoveChild}
        />
      )}

      {asset.kind === 'image' && (
        <figure className="asset-figure">
          <img src={asset.url} alt={asset.file_name || ''} />
          {/* Downloadable by anyone, admin or client — the button appears on
              hover over the image itself, and on keyboard focus. */}
          <a
            className="img-download"
            href={asset.url}
            download={asset.file_name || 'image'}
            title="Download image"
            aria-label={`Download ${asset.file_name || 'image'}`}
          >
            <Download width="15" height="15" />
          </a>
        </figure>
      )}
    </article>
  )
}

/**
 * A row of cells, two or three across, flowing onto further rows. A cell holds
 * an image or a block of text, and an admin switches one for the other without
 * it losing its place — an image switched to text keeps its file, so switching
 * back brings the picture with it.
 */
function ImageGrid({ grid, cells, admin, actions, onAddImage, onRemoveChild }) {
  const visible = admin ? cells : cells.filter((c) => (c.kind === 'image' ? c.url : c.body))
  if (!visible.length && !admin) return null

  // The layout follows the cells: three of them is a grid of three, and taking
  // one out leaves a grid of two.
  const cols = Math.min(3, Math.max(1, cells.length))

  return (
    <div className={`img-grid cols-${cols}`}>
      {visible.map((cell) => (
        <div key={cell.id} className={`grid-tile tile-${cell.kind}`}>
          {cell.kind === 'paragraph' ? (
            admin ? (
              <AutoGrow
                className="tile-text-input"
                defaultValue={cell.body ?? ''}
                placeholder="Write here…"
                onCommit={(v) => v !== cell.body && actions.updateBrandAsset(cell.id, { body: v })}
              />
            ) : (
              <p className="tile-text">{cell.body}</p>
            )
          ) : cell.url ? (
            <>
              <img src={cell.url} alt={cell.file_name || ''} />
              <a
                className="img-download"
                href={cell.url}
                download={cell.file_name || 'image'}
                title="Download image"
                aria-label={`Download ${cell.file_name || 'image'}`}
              >
                <Download width="15" height="15" />
              </a>
            </>
          ) : (
            // An empty image cell — a text cell switched across with no picture.
            <label className="tile-empty">
              <ImageGlyph width="18" height="18" />
              <span>Choose an image</span>
              <input
                type="file"
                accept="image/*"
                hidden
                onChange={(e) => {
                  onAddImage(e.target.files?.[0], cell.id)
                  e.target.value = ''
                }}
              />
            </label>
          )}

          {admin && (
            <div className="tile-tools">
              <div className="size-pick" role="group" aria-label="Cell type">
                <button
                  className={cell.kind === 'image' ? 'is-on' : ''}
                  onClick={() => cell.kind !== 'image' && actions.updateBrandAsset(cell.id, { kind: 'image' })}
                  title="Show as an image"
                >
                  <ImageGlyph width="12" height="12" />
                </button>
                <button
                  className={cell.kind === 'paragraph' ? 'is-on' : ''}
                  onClick={() => cell.kind !== 'paragraph' && actions.updateBrandAsset(cell.id, { kind: 'paragraph' })}
                  title="Show as text"
                >
                  <TextGlyph width="12" height="12" />
                </button>
              </div>
              <button className="icon-btn tiny danger" onClick={() => onRemoveChild(cell)} title="Remove cell">
                <X width="12" height="12" />
              </button>
            </div>
          )}
        </div>
      ))}

    </div>
  )
}

/* -------------------------------------------------------------------------- */

/** Downloadables: a grid of zips to download and links out. */
function DownloadGrid({ section, assets, admin, actions, onAddFile, onRemove, onMove }) {
  const [linking, setLinking] = useState(false)
  const [label, setLabel] = useState('')
  const [url, setUrl] = useState('')

  const submitLink = async (e) => {
    e.preventDefault()
    if (!url.trim()) return
    await actions.addBrandAsset({
      section_id: section.id,
      kind: 'link',
      title: label.trim() || hostOf(withProtocol(url)),
      url: withProtocol(url)
    })
    setLabel('')
    setUrl('')
    setLinking(false)
  }

  return (
    <div className="dl-grid">
      {assets.map((a, i) => (
        <div key={a.id} className={`dl-box kind-${a.kind}`}>
          <span className="dl-icon">
            {a.kind === 'link' ? <LinkIcon width="16" height="16" /> : <ZipGlyph width="16" height="16" />}
          </span>

          {admin ? (
            <input
              className="dl-title-input"
              defaultValue={a.title ?? ''}
              placeholder="Name"
              onBlur={(e) => e.target.value !== a.title && actions.updateBrandAsset(a.id, { title: e.target.value })}
              onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
            />
          ) : (
            <span className="dl-title">{a.title}</span>
          )}

          <span className="dl-meta">
            {a.kind === 'link' ? hostOf(a.url) : `${(a.file_name || '').split('.').pop().toUpperCase()} · ${formatBytes(a.file_size)}`}
          </span>

          {a.kind === 'link' ? (
            <a className="ghost-btn" href={a.url} target="_blank" rel="noopener noreferrer">
              Open
            </a>
          ) : (
            <a className="ghost-btn" href={a.url} download={a.file_name || 'download.zip'}>
              <Download width="14" height="14" /> Download
            </a>
          )}

          {admin && (
            <div className="dl-tools">
              <button className="icon-btn tiny" disabled={i === 0} onClick={() => onMove(a, 'up')} title="Move up">
                <ArrowUp width="12" height="12" />
              </button>
              <button className="icon-btn tiny flip" disabled={i === assets.length - 1} onClick={() => onMove(a, 'down')} title="Move down">
                <ArrowUp width="12" height="12" />
              </button>
              <button className="icon-btn tiny danger" onClick={() => onRemove(a)} title="Remove">
                <Trash width="12" height="12" />
              </button>
            </div>
          )}
        </div>
      ))}

      {admin && (
        <>
          <label className="dl-box is-new">
            <ZipGlyph width="18" height="18" />
            <strong>Upload a zip</strong>
            <span>The asset pack, ready to hand over.</span>
            <input
              type="file"
              accept=".zip,application/zip,application/x-zip-compressed"
              hidden
              onChange={(e) => {
                onAddFile(e.target.files?.[0])
                e.target.value = ''
              }}
            />
          </label>

          {linking ? (
            <form className="dl-box is-new is-form" onSubmit={submitLink}>
              <input autoFocus value={label} placeholder="Name" onChange={(e) => setLabel(e.target.value)} />
              <input value={url} placeholder="https://…" onChange={(e) => setUrl(e.target.value)} />
              <div className="dl-form-actions">
                <button type="submit" className="primary-btn">
                  Add link
                </button>
                <button type="button" className="icon-btn tiny" onClick={() => setLinking(false)} title="Cancel">
                  <X width="12" height="12" />
                </button>
              </div>
            </form>
          ) : (
            <button className="dl-box is-new" onClick={() => setLinking(true)}>
              <LinkIcon width="18" height="18" />
              <strong>Add a link</strong>
              <span>Point at where the files already live.</span>
            </button>
          )}
        </>
      )}

      {!assets.length && !admin && (
        <div className="brand-empty">
          <span className="brand-empty-note">Nothing here yet</span>
          <p>Downloads will appear here once they are ready.</p>
        </div>
      )}
    </div>
  )
}

/* -------------------------------------------------------------------------- */

function AutoGrow({ defaultValue, onCommit, className, placeholder }) {
  const ref = useRef(null)
  const [value, setValue] = useState(defaultValue)
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
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => onCommit(value)}
    />
  )
}
