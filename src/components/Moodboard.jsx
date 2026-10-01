import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useStore } from '../state/store'
import { Plus, Trash } from './Icons'
import ConfirmDialog from './ConfirmDialog'
import {
  ACCEPTED,
  BOARD_H,
  BOARD_W,
  clampToBoard,
  clampZoom,
  dropSize,
  fitToLimit,
  imagesFromClipboard,
  isImage,
  MAX_ZOOM,
  MIN_ZOOM,
  resizeFrom,
  shrunkMessage,
  tooBigMessage
} from '../lib/moodboard'

/**
 * The mood board — the third app on the rail.
 *
 * It is a canvas and nothing else: pictures go on it, pictures move around on
 * it. No order, no categories, no approval. The other two apps are a process;
 * this one is a wall, and the client pins things to it exactly as freely as the
 * studio does.
 *
 * Three gestures, told apart by what is under the pointer and how many there
 * are: one on a picture moves it, one on bare board pans, two pinch. The wheel
 * zooms rather than scrolls, which is what a canvas does and a page does not.
 */
export default function Moodboard() {
  const { session, project, moodboard, actions } = useStore()
  const scrollRef = useRef(null)
  const fileRef = useRef(null)
  const [notice, setNotice] = useState(null)
  const [pending, setPending] = useState(null) // image waiting on a confirm
  const [busy, setBusy] = useState(false)
  const [zoom, setZoom] = useState(1)
  const zoomRef = useRef(1)
  zoomRef.current = zoom

  const dragRef = useRef(null)
  const [dragId, setDragId] = useState(null)

  /**
   * Where pictures are, as far as this screen is concerned.
   *
   * A move is written and the whole store is reloaded, which takes as long as
   * it takes. Until that comes back the stored row still holds the old place,
   * so anything reading from it — including picking the same picture up again
   * — starts from there and the image snaps backwards. Moving quickly is
   * exactly the case where the next grab beats the last save home, which is
   * why it looked like jumping back and forth.
   *
   * So the board keeps its own answer per picture and prefers it, and lets go
   * only once the store comes back agreeing. One entry per picture, until the
   * two of them match.
   */
  const [pos, setPos] = useState({})
  const posRef = useRef({})
  const setPosFor = (id, p) => {
    posRef.current = { ...posRef.current, [id]: p }
    setPos(posRef.current)
  }
  // Position AND size: a resize is held back by the same round trip a move is.
  const whereIs = (item) =>
    posRef.current[item.id] ?? { x: item.x, y: item.y, w: item.w, h: item.h }

  // Let go of a local answer the moment the stored one says the same thing.
  useEffect(() => {
    const held = posRef.current
    if (!Object.keys(held).length) return
    let next = held
    for (const item of moodboard) {
      const p = held[item.id]
      if (!p || dragRef.current?.id === item.id) continue
      const same = ['x', 'y', 'w', 'h'].every((k) => Math.round(item[k]) === Math.round(p[k]))
      if (same) {
        if (next === held) next = { ...held }
        delete next[item.id]
      }
    }
    if (next !== held) {
      posRef.current = next
      setPos(next)
    }
  }, [moodboard])

  useEffect(() => {
    if (!notice) return
    const id = setTimeout(() => setNotice(null), 6000)
    return () => clearTimeout(id)
  }, [notice])

  // Open in the middle of the board rather than its top-left corner, which is
  // a corner of nothing.
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    el.scrollTo({
      left: Math.max(0, (BOARD_W * zoomRef.current - el.clientWidth) / 2),
      top: Math.max(0, (BOARD_H * zoomRef.current - el.clientHeight) / 2),
      behavior: 'auto'
    })
    // Only when the board itself changes — not on every zoom.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project?.id])

  /** Board coordinates for the middle of what is on screen. */
  const centreOfView = () => {
    const el = scrollRef.current
    const z = zoomRef.current
    if (!el) return { x: BOARD_W / 2, y: BOARD_H / 2 }
    return {
      x: (el.scrollLeft + el.clientWidth / 2) / z,
      y: (el.scrollTop + el.clientHeight / 2) / z
    }
  }

  /**
   * Zoom about a point on screen, so whatever is under the cursor or between
   * two fingers stays under it. Zooming about the corner instead sends the
   * thing you were looking at off the edge, which is the difference between a
   * canvas and a page that happens to get bigger.
   */
  const zoomAt = useCallback((next, clientX, clientY) => {
    const el = scrollRef.current
    if (!el) return
    const z0 = zoomRef.current
    const z1 = clampZoom(next)
    if (Math.abs(z1 - z0) < 0.0001) return
    const r = el.getBoundingClientRect()
    const cx = clientX - r.left
    const cy = clientY - r.top
    // The board point under the pointer, which must not move.
    const bx = (el.scrollLeft + cx) / z0
    const by = (el.scrollTop + cy) / z0
    zoomRef.current = z1
    anchor.current = { left: bx * z1 - cx, top: by * z1 - cy }
    setZoom(z1)
  }, [])

  /**
   * Put the scroll back so that point is under the pointer again.
   *
   * It has to happen after the board has been redrawn at the new size and
   * before the screen is painted, which is exactly what a layout effect is.
   * Doing it on the next frame instead sets a scroll the panel cannot reach
   * yet — the extent is still the old size, so the browser clamps it to the
   * old maximum and the board jumps to its edge.
   */
  const anchor = useRef(null)
  useLayoutEffect(() => {
    const el = scrollRef.current
    const a = anchor.current
    if (!el || !a) return
    anchor.current = null
    el.scrollLeft = a.left
    el.scrollTop = a.top
  }, [zoom])

  // The wheel zooms. A board is not a page: there is no "down" to scroll to,
  // and panning is what dragging it is for. A trackpad pinch arrives as a
  // wheel with ctrlKey set and means the same thing, only finer.
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const onWheel = (e) => {
      e.preventDefault()
      const step = e.ctrlKey ? 0.01 : 0.0022
      zoomAt(zoomRef.current * Math.exp(-e.deltaY * step), e.clientX, e.clientY)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [zoomAt])

  /**
   * Put a picture on the board.
   *
   * The size is read from the image itself before anything is sent, so it
   * lands at its own shape rather than snapping to a square and jumping once
   * the real one loads.
   */
  const add = useCallback(
    async (files) => {
      const list = [...files].filter(isImage)
      if (!list.length) return

      setBusy(true)
      let shrunk = null
      try {
        // Fanned out from the middle of what is on screen, so dropping several
        // does not stack them into one pile with only the last one visible.
        const mid = centreOfView()
        for (let i = 0; i < list.length; i++) {
          // Anything over the limit is made to fit before it goes anywhere.
          // Only something that still will not fit is turned away.
          const fitted = await fitToLimit(list[i])
          if (!fitted) {
            setNotice(tooBigMessage(list[i]))
            continue
          }
          if (fitted.shrunk) shrunk = fitted

          const { w, h } = await measure(fitted.file)
          const offset = i * 28
          const { x, y } = clampToBoard(mid.x - w / 2 + offset, mid.y - h / 2 + offset, w, h)
          await actions.addMoodboardImage({ file: fitted.file, x, y, w, h })
        }
        if (shrunk) setNotice(shrunkMessage(shrunk))
      } catch (e) {
        setNotice(e.message)
      } finally {
        setBusy(false)
      }
    },
    [actions]
  )

  /**
   * Paste a picture straight onto the board.
   *
   * The whole point of a mood board is the speed of it: take a screenshot, hit
   * paste, it is up. The listener is on the document because a paste goes to
   * whatever has focus, and on a board with nothing to type into that is
   * usually nothing at all — so there is no one element to hang it off.
   *
   * A paste carrying no picture is left alone rather than refused: pasting
   * text onto a mood board is not an error, it is just not a thing it does.
   */
  useEffect(() => {
    const onPaste = (e) => {
      const images = imagesFromClipboard(e.clipboardData)
      if (!images.length) return
      e.preventDefault()
      add(images)
    }
    document.addEventListener('paste', onPaste)
    return () => document.removeEventListener('paste', onPaste)
  }, [add])

  // --- moving a picture ------------------------------------------------------
  const pointers = useRef(new Map())

  const onImagePointerDown = (e, item) => {
    if (e.button === 1 || e.button === 2) return
    if (pointers.current.size) return // a second finger means a pinch, not a move
    e.preventDefault()
    e.stopPropagation() // not a pan

    // From where the picture IS, which is not always where the store thinks.
    const at = whereIs(item)
    // The drag is set up BEFORE the pointer is captured, and the capture is
    // allowed to fail. It throws if the pointer is already gone, and anything
    // after it in here would then never run — the picture would take the press
    // and refuse to move, which is a worse failure than losing the capture.
    dragRef.current = {
      kind: 'move',
      id: item.id,
      pointerId: e.pointerId,
      from: { x: e.clientX, y: e.clientY },
      at,
      now: at,
      moved: false
    }
    setDragId(item.id)
    try {
      e.currentTarget.setPointerCapture?.(e.pointerId)
    } catch {
      /* the pointer is already gone; the move handlers still work */
    }
  }

  /** The corner that makes a picture bigger or smaller. */
  const onResizePointerDown = (e, item) => {
    if (e.button === 1 || e.button === 2) return
    if (pointers.current.size) return
    e.preventDefault()
    e.stopPropagation() // not a move, and not a pan

    const at = whereIs(item)
    dragRef.current = {
      kind: 'size',
      id: item.id,
      pointerId: e.pointerId,
      from: { x: e.clientX, y: e.clientY },
      at,
      now: at,
      moved: false
    }
    setDragId(item.id)
    try {
      e.currentTarget.setPointerCapture?.(e.pointerId)
    } catch {
      /* the pointer is already gone; the move handlers still work */
    }
  }

  const onImagePointerMove = (e) => {
    const d = dragRef.current
    if (!d || d.pointerId !== e.pointerId) return
    // Screen pixels into board pixels: zoomed out, a picture has to keep up
    // with the pointer rather than crawl behind it.
    const z = zoomRef.current
    const dx = (e.clientX - d.from.x) / z
    const dy = (e.clientY - d.from.y) / z

    const next =
      d.kind === 'size'
        ? { ...d.at, ...resizeFrom(d.at.w, d.at.h, dx, dy, d.at.x, d.at.y) }
        : { ...d.at, ...clampToBoard(d.at.x + dx, d.at.y + dy, d.at.w, d.at.h) }

    if (!d.moved && Math.hypot(e.clientX - d.from.x, e.clientY - d.from.y) > 3) d.moved = true
    d.now = next
    setPosFor(d.id, next)
  }

  const onImagePointerUp = (e) => {
    const d = dragRef.current
    if (!d || d.pointerId !== e.pointerId) return
    dragRef.current = null
    setDragId(null)
    // A press that never moved is not a move. Writing one would be a round
    // trip and a reload to say nothing happened.
    if (!d.moved) return
    // The local answer stays until the store comes back agreeing with it —
    // see the effect at the top. There is nothing to clear here.
    actions.moveMoodboardItem(
      d.id,
      d.kind === 'size'
        ? { w: Math.round(d.now.w), h: Math.round(d.now.h) }
        : { x: Math.round(d.now.x), y: Math.round(d.now.y) }
    )
  }

  // --- panning and pinching --------------------------------------------------
  const panRef = useRef(null)
  const pinchRef = useRef(null)

  const onBoardPointerDown = (e) => {
    const el = scrollRef.current
    if (!el || e.button === 1 || e.button === 2) return
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })

    if (pointers.current.size === 2) {
      // Two fingers: stop panning and start pinching from where they are now.
      panRef.current = null
      const [a, b] = [...pointers.current.values()]
      pinchRef.current = { gap: Math.hypot(a.x - b.x, a.y - b.y) || 1, zoom: zoomRef.current }
      return
    }
    if (pointers.current.size === 1) {
      panRef.current = {
        pointerId: e.pointerId,
        from: { x: e.clientX, y: e.clientY },
        at: { left: el.scrollLeft, top: el.scrollTop }
      }
    }
  }

  const onBoardPointerMove = (e) => {
    const el = scrollRef.current
    if (!el) return
    if (pointers.current.has(e.pointerId)) {
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    }

    const pinch = pinchRef.current
    if (pinch && pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()]
      const gap = Math.hypot(a.x - b.x, a.y - b.y) || 1
      zoomAt(pinch.zoom * (gap / pinch.gap), (a.x + b.x) / 2, (a.y + b.y) / 2)
      return
    }

    const p = panRef.current
    if (!p || p.pointerId !== e.pointerId) return
    el.scrollLeft = p.at.left - (e.clientX - p.from.x)
    el.scrollTop = p.at.top - (e.clientY - p.from.y)
  }

  const endBoardPointer = (e) => {
    pointers.current.delete(e.pointerId)
    if (pointers.current.size < 2) pinchRef.current = null
    if (!pointers.current.size) panRef.current = null
  }

  const canRemove = (item) => !!session && (item.created_by === session.id || session.role === 'admin')
  const atCentre = (next) => {
    const el = scrollRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    zoomAt(next, r.left + r.width / 2, r.top + r.height / 2)
  }

  return (
    <main className="stage">
      <div
        className="mood-scroll"
        ref={scrollRef}
        onPointerDown={onBoardPointerDown}
        onPointerMove={onBoardPointerMove}
        onPointerUp={endBoardPointer}
        onPointerCancel={endBoardPointer}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault()
          add(e.dataTransfer.files)
        }}
      >
        {/* The extent is the board at its drawn size, so the panel has
            something the right shape to scroll over; the board inside is
            always its own full size and is scaled. Scaling the scrolling
            element itself would leave the scroll measuring the wrong thing. */}
        <div className="mood-extent" style={{ width: BOARD_W * zoom, height: BOARD_H * zoom }}>
          <div
            className="mood-board"
            style={{ width: BOARD_W, height: BOARD_H, transform: `scale(${zoom})` }}
          >
            {moodboard.map((item) => {
              const at = pos[item.id] ?? item
              return (
                <div
                  key={item.id}
                  className={`mood-item ${dragId === item.id ? 'is-dragging' : ''}`}
                  data-mood-id={item.id}
                  style={{ left: at.x, top: at.y, width: at.w, height: at.h, zIndex: item.z + 1 }}
                  onPointerDown={(e) => onImagePointerDown(e, item)}
                  onPointerMove={onImagePointerMove}
                  onPointerUp={onImagePointerUp}
                  onPointerCancel={onImagePointerUp}
                >
                  <img src={item.url} alt={item.file_name || ''} draggable={false} />
                  {/* The corner. Proportional always: a picture pulled out of
                      shape is a different picture. */}
                  <span
                    className="mood-size"
                    title="Drag to resize"
                    onPointerDown={(e) => onResizePointerDown(e, item)}
                    onPointerMove={onImagePointerMove}
                    onPointerUp={onImagePointerUp}
                    onPointerCancel={onImagePointerUp}
                  />
                  {canRemove(item) && (
                    <button
                      className="icon-btn danger mood-remove"
                      title="Take this off the board"
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={() => setPending(item)}
                    >
                      <Trash width="13" height="13" />
                    </button>
                  )}
                </div>
              )
            })}

            {!moodboard.length && (
              <div className="mood-empty" style={{ left: BOARD_W / 2, top: BOARD_H / 2 }}>
                <h3>Nothing on the board yet</h3>
                <p>
                  Paste a screenshot, drop a file in, or add one below. Drag a picture to move it,
                  drag the board to look around, scroll to zoom.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Pinned to the panel, so they stay put while the board moves under. */}
      <div className="mood-zoom">
        <button
          className="icon-btn"
          title="Zoom out"
          disabled={zoom <= MIN_ZOOM + 0.001}
          onClick={() => atCentre(zoom / 1.3)}
        >
          <span aria-hidden>–</span>
        </button>
        <button className="mood-zoom-level" title="Back to actual size" onClick={() => atCentre(1)}>
          {Math.round(zoom * 100)}%
        </button>
        <button
          className="icon-btn"
          title="Zoom in"
          disabled={zoom >= MAX_ZOOM - 0.001}
          onClick={() => atCentre(zoom * 1.3)}
        >
          <span aria-hidden>+</span>
        </button>
      </div>

      <button className="mood-add" onClick={() => fileRef.current?.click()} disabled={busy}>
        <Plus width="15" height="15" />
        {busy ? 'Adding…' : 'Add image'}
      </button>

      <input
        ref={fileRef}
        type="file"
        accept={ACCEPTED}
        multiple
        hidden
        onChange={(e) => {
          add(e.target.files)
          e.target.value = '' // the same file twice in a row still counts as a change
        }}
      />

      {pending && (
        <ConfirmDialog
          title="Take this off the board?"
          body="It is removed for everyone. This cannot be undone."
          confirmLabel="Remove"
          onCancel={() => setPending(null)}
          onConfirm={() => {
            actions.removeMoodboardImage(pending.id)
            setPending(null)
          }}
        />
      )}

      {notice && (
        <div className="toast" onClick={() => setNotice(null)} role="status">
          {notice}
        </div>
      )}
    </main>
  )
}

/**
 * How big a picture is, before it goes anywhere.
 *
 * Read from the file in the browser so the image lands at its own shape the
 * moment it appears. Falls back to a square if the file will not decode — the
 * server will refuse it in a moment anyway, and guessing is better than
 * throwing here.
 */
function measure(file) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(dropSize(img.naturalWidth, img.naturalHeight))
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      resolve(dropSize(0, 0))
    }
    img.src = url
  })
}
