import { useLayoutEffect, useRef, useState } from 'react'
import { formatBytes, hostOf, readFileAsDataUrl, withProtocol } from '../lib/files'
import {
  ArrowUp,
  Download,
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

  const remove = (asset) => setPending(asset)

  const move = (asset, direction) => actions.moveBrandAsset(asset.id, direction)

  const addFile = async (file, kind) => {
    if (!file) return
    try {
      const read = await readFileAsDataUrl(file)
      await actions.addBrandAsset({
        section_id: section.id,
        kind,
        // A zip in Downloadables is named; an image is not.
        title: kind === 'image' ? '' : file.name.replace(/\.[^.]+$/, ''),
        ...read
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
      {assets.map((a, i) => (
        <AssetRow
          key={a.id}
          asset={a}
          admin={admin}
          first={i === 0}
          last={i === assets.length - 1}
          actions={actions}
          onRemove={() => remove(a)}
          onMove={(d) => move(a, d)}
        />
      ))}

      {!assets.length && (
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
            onClick={() => actions.addBrandAsset({ section_id: section.id, kind: 'heading', title: '' })}
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
        </div>
      )}

      {pending && (
        <ConfirmDialog
          title={`Delete "${pending.title || 'this item'}"?`}
          body="This cannot be undone."
          onCancel={() => setPending(null)}
          onConfirm={() => {
            actions.removeBrandAsset(pending.id)
            setPending(null)
          }}
        />
      )}
    </div>
  )
}

/* -------------------------------------------------------------------------- */

function AssetRow({ asset, admin, first, last, actions, onRemove, onMove }) {
  return (
    <article className={`asset asset-${asset.kind}`}>
      {admin && (
        <div className="asset-tools">
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

      {/* A headline carries a title, a paragraph carries a body, and an image
          is just the image — put a headline above it if it needs naming.
          ('text' is the older combined row, still rendered so a snapshot
          written before the split keeps working.) */}
      {(asset.kind === 'heading' || asset.kind === 'text') &&
        (admin ? (
          <input
            className={asset.kind === 'heading' ? 'asset-heading-input' : 'asset-title-input'}
            defaultValue={asset.title}
            placeholder="Headline"
            onBlur={(e) =>
              e.target.value !== asset.title && actions.updateBrandAsset(asset.id, { title: e.target.value })
            }
            onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
          />
        ) : (
          asset.title &&
          (asset.kind === 'heading' ? (
            <h3 className="asset-heading">{asset.title}</h3>
          ) : (
            <h4 className="asset-title">{asset.title}</h4>
          ))
        ))}

      {(asset.kind === 'paragraph' || asset.kind === 'text') &&
        (admin ? (
          <AutoGrow
            className="asset-body-input"
            defaultValue={asset.body ?? ''}
            placeholder="Write here…"
            onCommit={(v) => v !== asset.body && actions.updateBrandAsset(asset.id, { body: v })}
          />
        ) : (
          <p className="asset-body">{asset.body}</p>
        ))}

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
              defaultValue={a.title}
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
