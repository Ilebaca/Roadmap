import { useCallback, useEffect, useRef, useState } from 'react'
import { useStore } from '../state/store'
import { Plus, Trash } from './Icons'
import ConfirmDialog from './ConfirmDialog'
import {
  ACCEPTED,
  BOARD_H,
  BOARD_W,
  MAX_IMAGE_BYTES,
  clampToBoard,
  dropSize,
  isImage,
  tooBigMessage
} from '../lib/moodboard'

/**
 * The mood board — the third app on the rail, and the only black surface here.
 *
 * It is a canvas and nothing else: pictures go on it, pictures move around on
 * it. No order, no categories, no approval. The other two apps are a process;
 * this one is a wall, and the client pins things to it exactly as freely as the
 * studio does.
 *
 * The board is larger than any screen, so dragging does two different things
 * depending on what is under the finger: an image moves, the bare canvas pans.
 * That is the whole interaction, and it is the one every canvas tool uses,
 * which is why it needs no explaining.
 */
export default function Moodboard() {
  const { session, project, moodboard, actions } = useStore()
  const scrollRef = useRef(null)
  const fileRef = useRef(null)
  const [notice, setNotice] = useState(null)
  const [pending, setPending] = useState(null) // image waiting on a confirm
  const [busy, setBusy] = useState(false)

  // Where each image is being dragged to, before it is written down. The board
  // follows the finger from here; the server hears once, on release.
  //
  // The position is kept in BOTH: the state so React redraws, the ref because
  // the release has to know where the image actually ended up. Reading state
  // there would be reading whatever React last rendered, and a press, a move
  // and a release can all land before it renders once.
  const [drag, setDrag] = useState(null)
  const dragRef = useRef(null)

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
      left: Math.max(0, (BOARD_W - el.clientWidth) / 2),
      top: Math.max(0, (BOARD_H - el.clientHeight) / 2),
      behavior: 'auto'
    })
  }, [project?.id])

  /** Board coordinates for the middle of what is on screen. */
  const centreOfView = () => {
    const el = scrollRef.current
    if (!el) return { x: BOARD_W / 2, y: BOARD_H / 2 }
    return { x: el.scrollLeft + el.clientWidth / 2, y: el.scrollTop + el.clientHeight / 2 }
  }

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
      const tooBig = list.find((f) => f.size > MAX_IMAGE_BYTES)
      if (tooBig) return setNotice(tooBigMessage(tooBig))

      setBusy(true)
      try {
        // Fanned out from the middle, so dropping several does not stack them
        // into one pile with only the last one visible.
        const mid = centreOfView()
        for (let i = 0; i < list.length; i++) {
          const file = list[i]
          const { w, h } = await measure(file)
          const offset = i * 28
          const { x, y } = clampToBoard(mid.x - w / 2 + offset, mid.y - h / 2 + offset, w, h)
          await actions.addMoodboardImage({ file, x, y, w, h })
        }
      } catch (e) {
        setNotice(e.message)
      } finally {
        setBusy(false)
      }
    },
    [actions]
  )

  // --- dragging --------------------------------------------------------------
  // An image follows the pointer; the bare canvas scrolls under it. Both are
  // the same gesture, told apart by what it started on.
  const onImagePointerDown = (e, item) => {
    if (e.button === 1 || e.button === 2) return
    e.preventDefault()
    e.stopPropagation() // not a pan
    // The drag is set up BEFORE the pointer is captured, and the capture is
    // allowed to fail. It throws if the pointer is already gone, and anything
    // after it in here would then never run — the picture would take the press
    // and refuse to move, which is a worse failure than losing the capture.
    dragRef.current = {
      id: item.id,
      pointerId: e.pointerId,
      from: { x: e.clientX, y: e.clientY },
      at: { x: item.x, y: item.y },
      w: item.w,
      h: item.h,
      now: { x: item.x, y: item.y },
      moved: false
    }
    setDrag({ id: item.id, x: item.x, y: item.y })
    try {
      e.currentTarget.setPointerCapture?.(e.pointerId)
    } catch {
      /* the pointer is already gone; the move handlers still work */
    }
  }

  const onImagePointerMove = (e) => {
    const d = dragRef.current
    if (!d || d.pointerId !== e.pointerId) return
    const next = clampToBoard(
      d.at.x + (e.clientX - d.from.x),
      d.at.y + (e.clientY - d.from.y),
      d.w,
      d.h
    )
    if (!d.moved && Math.hypot(e.clientX - d.from.x, e.clientY - d.from.y) > 3) d.moved = true
    d.now = next
    setDrag({ id: d.id, ...next })
  }

  const onImagePointerUp = (e) => {
    const d = dragRef.current
    if (!d || d.pointerId !== e.pointerId) return
    dragRef.current = null
    setDrag(null)
    // A press that never moved is not a move. Writing one would be a round
    // trip and a reload to say nothing happened.
    if (!d.moved) return
    actions.moveMoodboardItem(d.id, { x: Math.round(d.now.x), y: Math.round(d.now.y) })
  }

  // Panning: the canvas scrolls under a drag on bare board.
  const panRef = useRef(null)
  const onBoardPointerDown = (e) => {
    const el = scrollRef.current
    if (!el || e.button === 1 || e.button === 2) return
    panRef.current = {
      pointerId: e.pointerId,
      from: { x: e.clientX, y: e.clientY },
      at: { left: el.scrollLeft, top: el.scrollTop }
    }
  }
  const onBoardPointerMove = (e) => {
    const p = panRef.current
    const el = scrollRef.current
    if (!p || !el || p.pointerId !== e.pointerId) return
    el.scrollLeft = p.at.left - (e.clientX - p.from.x)
    el.scrollTop = p.at.top - (e.clientY - p.from.y)
  }
  const endPan = () => {
    panRef.current = null
  }

  const canRemove = (item) => !!session && (item.created_by === session.id || session.role === 'admin')

  return (
    <main className="stage">
      <div
        className="mood-scroll"
        ref={scrollRef}
        onPointerDown={onBoardPointerDown}
        onPointerMove={onBoardPointerMove}
        onPointerUp={endPan}
        onPointerCancel={endPan}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault()
          add(e.dataTransfer.files)
        }}
      >
        <div className="mood-board" style={{ width: BOARD_W, height: BOARD_H }}>
          {moodboard.map((item) => {
            const live = drag && drag.id === item.id ? drag : item
            return (
              <div
                key={item.id}
                className={`mood-item ${drag?.id === item.id ? 'is-dragging' : ''}`}
                data-mood-id={item.id}
                style={{ left: live.x, top: live.y, width: item.w, height: item.h, zIndex: item.z + 1 }}
                onPointerDown={(e) => onImagePointerDown(e, item)}
                onPointerMove={onImagePointerMove}
                onPointerUp={onImagePointerUp}
                onPointerCancel={onImagePointerUp}
              >
                <img src={item.url} alt={item.file_name || ''} draggable={false} />
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
              <p>Add a picture and drag it anywhere. Drag the board itself to move around.</p>
            </div>
          )}
        </div>
      </div>

      {/* Stays put while the board moves under it. */}
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
