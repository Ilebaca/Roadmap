import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
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
  hits,
  imagesFromClipboard,
  isImage,
  MAX_ZOOM,
  MIN_ZOOM,
  moveGroup,
  rectBetween,
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
 * What the pointer does, in one place, because a canvas lives or dies on this:
 *
 *   left press on a picture   picks it (and everything picked with it) up
 *   left press on the board   draws a lasso; a press that never moves clears
 *   shift / ⌘ / ctrl click    adds one picture to the selection, or drops it
 *   middle button             pans, anywhere, picture or not
 *   one finger on the board   pans
 *   long press on a picture   adds it to the selection — touch has no shift
 *   two fingers / wheel       zooms
 *
 * The middle button pans rather than the left one because the left one is now
 * the lasso, and a canvas where you cannot pick several things at once is a
 * canvas you can only tidy one picture at a time.
 */
export default function Moodboard() {
  const { session, project, moodboard, actions } = useStore()
  const scrollRef = useRef(null)
  const fileRef = useRef(null)
  const [notice, setNotice] = useState(null)
  const [pending, setPending] = useState(null) // pictures waiting on a confirm
  const [busy, setBusy] = useState(false)
  const [zoom, setZoom] = useState(1)
  const zoomRef = useRef(1)
  zoomRef.current = zoom

  const dragRef = useRef(null)
  const [dragIds, setDragIds] = useState([])

  /**
   * What is picked. An array because it is small and ordered reads better in
   * the places that count it.
   */
  const [selected, setSelected] = useState([])
  const selRef = useRef([])
  const select = useCallback((ids) => {
    selRef.current = ids
    setSelected(ids)
  }, [])
  const isSelected = (id) => selected.includes(id)

  const byId = useMemo(() => new Map(moodboard.map((i) => [i.id, i])), [moodboard])

  // A picture taken off the board cannot stay picked.
  useEffect(() => {
    const live = selRef.current.filter((id) => byId.has(id))
    if (live.length !== selRef.current.length) select(live)
  }, [byId, select])

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
  const setPosForMany = (m) => {
    posRef.current = { ...posRef.current, ...m }
    setPos(posRef.current)
  }
  // Position AND size: a resize is held back by the same round trip a move is.
  const whereIs = (item) =>
    posRef.current[item.id] ?? { x: item.x, y: item.y, w: item.w, h: item.h }

  /** Is this picture in the air right now? Its own answer must not be dropped. */
  const inFlight = (id) => {
    const d = dragRef.current
    return !!d && (d.id === id || d.ids?.includes(id))
  }

  // Let go of a local answer the moment the stored one says the same thing.
  useEffect(() => {
    const held = posRef.current
    if (!Object.keys(held).length) return
    let next = held
    for (const item of moodboard) {
      const p = held[item.id]
      if (!p || inFlight(item.id)) continue
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

  /** Board coordinates for a point on screen. */
  const boardPoint = (clientX, clientY) => {
    const el = scrollRef.current
    const z = zoomRef.current
    if (!el) return { x: 0, y: 0 }
    const r = el.getBoundingClientRect()
    return {
      x: (el.scrollLeft + clientX - r.left) / z,
      y: (el.scrollTop + clientY - r.top) / z
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

  const canRemove = useCallback(
    (item) => !!session && (item.created_by === session.id || session.role === 'admin'),
    [session]
  )

  /**
   * Held space turns the left button into the board itself.
   *
   * A trackpad has no middle button, and two fingers on one is the wheel,
   * which zooms here. Without this a laptop could pick things out and never
   * move the board at all.
   */
  const spaceRef = useRef(false)
  const [grabbing, setGrabbing] = useState(false)

  // Escape drops the selection; the delete keys ask about it. Both are what a
  // canvas does, and neither can fire while something is being typed into.
  useEffect(() => {
    const onKey = (e) => {
      const t = e.composedPath?.()[0] ?? e.target
      const tag = t?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || t?.isContentEditable) return
      if (e.code === 'Space') {
        spaceRef.current = true
        setGrabbing(true)
        // Space would otherwise scroll the page under the board.
        e.preventDefault()
        return
      }
      if (e.key === 'Escape') return select([])
      if (e.key !== 'Backspace' && e.key !== 'Delete') return
      const mine = selRef.current.map((id) => byId.get(id)).filter((it) => it && canRemove(it))
      if (!mine.length) return
      e.preventDefault()
      setPending(mine)
    }
    const onUp = (e) => {
      if (e.code !== 'Space') return
      spaceRef.current = false
      setGrabbing(false)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('keyup', onUp)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('keyup', onUp)
    }
  }, [byId, canRemove, select])

  // --- moving a picture ------------------------------------------------------
  const pointers = useRef(new Map())
  const holdRef = useRef(null)

  const clearHold = () => {
    if (holdRef.current) clearTimeout(holdRef.current)
    holdRef.current = null
  }

  /**
   * A touch has no shift key, so holding a picture is how you add it to the
   * selection. The timer dies the moment the finger travels, so a hold that
   * turns into a drag is a drag.
   *
   * It toggles against what was picked BEFORE this press, not after: the press
   * itself has already made this picture the selection, so reading it back
   * would see the picture it just picked and dutifully unpick it.
   */
  const startHold = (id, before) => {
    clearHold()
    holdRef.current = setTimeout(() => {
      holdRef.current = null
      dragRef.current = null
      setDragIds([])
      select(before.includes(id) ? before.filter((x) => x !== id) : [...before, id])
    }, 450)
  }

  const onImagePointerDown = (e, item) => {
    // The middle button pans wherever it is pressed, and so does held space, so
    // both are let through to the board below rather than taken here.
    if (e.button === 1 || e.button === 2 || spaceRef.current) return
    if (pointers.current.size) return // a second finger means a pinch, not a move
    e.preventDefault()
    e.stopPropagation() // not a pan, and not a lasso

    // What this press does to the selection, before it does anything to the
    // board: with a modifier it adds or drops this one; on something already
    // picked it keeps the group, so a group can be dragged by any member; on
    // anything else it becomes the selection.
    const together = e.shiftKey || e.metaKey || e.ctrlKey
    const before = selRef.current
    let ids = before
    if (together) {
      ids = ids.includes(item.id) ? ids.filter((x) => x !== item.id) : [...ids, item.id]
      select(ids)
      if (!ids.includes(item.id)) return // just dropped from the group: nothing to drag
    } else if (!ids.includes(item.id)) {
      ids = [item.id]
      select(ids)
    }

    // From where the pictures ARE, which is not always where the store thinks.
    const at = {}
    for (const id of ids) {
      const it = byId.get(id)
      if (it) at[id] = whereIs(it)
    }
    // The drag is set up BEFORE the pointer is captured, and the capture is
    // allowed to fail. It throws if the pointer is already gone, and anything
    // after it in here would then never run — the picture would take the press
    // and refuse to move, which is a worse failure than losing the capture.
    dragRef.current = {
      kind: 'move',
      ids: Object.keys(at),
      pointerId: e.pointerId,
      from: { x: e.clientX, y: e.clientY },
      at,
      now: at,
      moved: false
    }
    setDragIds(Object.keys(at))
    try {
      e.currentTarget.setPointerCapture?.(e.pointerId)
    } catch {
      /* the pointer is already gone; the move handlers still work */
    }
    if (e.pointerType !== 'mouse') startHold(item.id, before)
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
    setDragIds([item.id])
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

    if (!d.moved && Math.hypot(e.clientX - d.from.x, e.clientY - d.from.y) > 3) {
      d.moved = true
      clearHold() // travelling, so this was a drag and never a hold
    }

    if (d.kind === 'size') {
      const next = {
        ...d.at,
        ...resizeFrom(d.at.w, d.at.h, dx, dy, d.at.x, d.at.y)
      }
      d.now = next
      setPosFor(d.id, next)
      return
    }
    const next = moveGroup(d.at, dx, dy)
    d.now = next
    setPosForMany(next)
  }

  const onImagePointerUp = (e) => {
    const d = dragRef.current
    if (!d || d.pointerId !== e.pointerId) return
    dragRef.current = null
    setDragIds([])
    clearHold()
    // A press that never moved is not a move — it was the selection, which has
    // already happened. Writing one would be a round trip and a reload to say
    // nothing happened.
    if (!d.moved) return
    // The local answer stays until the store comes back agreeing with it —
    // see the effect at the top. There is nothing to clear here.
    if (d.kind === 'size') {
      actions.moveMoodboardItem(d.id, {
        w: Math.round(d.now.w),
        h: Math.round(d.now.h)
      })
      return
    }
    actions.moveMoodboardItems(
      Object.entries(d.now).map(([id, p]) => ({
        id,
        x: Math.round(p.x),
        y: Math.round(p.y)
      }))
    )
  }

  // --- panning, pinching and the lasso ---------------------------------------
  const panRef = useRef(null)
  const pinchRef = useRef(null)
  const lassoRef = useRef(null)
  const [lasso, setLasso] = useState(null)

  /**
   * A release the board never hears about leaves a pointer in the map that is
   * no longer on the glass, and from then on every press counts as the second
   * one — the board reads it as a pinch, so nothing pans and no picture can be
   * picked up. It happens whenever a press ends off the panel, so the window
   * is asked as well; whichever hears it first, the other finds nothing left
   * to do.
   */
  const endRef = useRef(null)
  useEffect(() => {
    const done = (e) => endRef.current?.(e)
    window.addEventListener('pointerup', done)
    window.addEventListener('pointercancel', done)
    return () => {
      window.removeEventListener('pointerup', done)
      window.removeEventListener('pointercancel', done)
    }
  }, [])

  const onBoardPointerDown = (e) => {
    const el = scrollRef.current
    if (!el || e.button === 2) return
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })

    if (pointers.current.size === 2) {
      // Two fingers: stop whatever one was doing and pinch from where they are.
      panRef.current = null
      lassoRef.current = null
      setLasso(null)
      const [a, b] = [...pointers.current.values()]
      pinchRef.current = {
        gap: Math.hypot(a.x - b.x, a.y - b.y) || 1,
        zoom: zoomRef.current
      }
      return
    }
    if (pointers.current.size !== 1) return

    // The left button draws; everything else here — the middle button, held
    // space, a finger, a pen — moves the board.
    if (e.pointerType === 'mouse' && e.button === 0 && !spaceRef.current) {
      e.preventDefault()
      const from = boardPoint(e.clientX, e.clientY)
      lassoRef.current = {
        pointerId: e.pointerId,
        from,
        rect: { ...from, w: 0, h: 0 },
        moved: false
      }
      setLasso({ ...from, w: 0, h: 0 })
      try {
        el.setPointerCapture?.(e.pointerId)
      } catch {
        /* nothing to capture; the move handler still runs */
      }
      return
    }
    e.preventDefault() // the middle button otherwise starts the browser's own scroll
    panRef.current = {
      pointerId: e.pointerId,
      from: { x: e.clientX, y: e.clientY },
      at: { left: el.scrollLeft, top: el.scrollTop },
      moved: false
    }
    try {
      // So a pan that wanders off the panel keeps panning rather than sticking.
      el.setPointerCapture?.(e.pointerId)
    } catch {
      /* nothing to capture; the move handler still runs */
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

    const l = lassoRef.current
    if (l && l.pointerId === e.pointerId) {
      const to = boardPoint(e.clientX, e.clientY)
      const z = zoomRef.current
      if (!l.moved && Math.hypot(to.x - l.from.x, to.y - l.from.y) * z > 3) l.moved = true
      l.rect = rectBetween(l.from, to)
      setLasso(l.rect)
      return
    }

    const p = panRef.current
    if (!p || p.pointerId !== e.pointerId) return
    if (!p.moved && Math.hypot(e.clientX - p.from.x, e.clientY - p.from.y) > 4) p.moved = true
    el.scrollLeft = p.at.left - (e.clientX - p.from.x)
    el.scrollTop = p.at.top - (e.clientY - p.from.y)
  }

  const endBoardPointer = (e) => {
    const l = lassoRef.current
    if (l && l.pointerId === e.pointerId) {
      lassoRef.current = null
      setLasso(null)
      // A press on bare board that went nowhere means: nothing, thank you.
      select(l.moved ? moodboard.filter((it) => hits(l.rect, whereIs(it))).map((it) => it.id) : [])
    }
    // A finger put on bare board and taken off again is a tap, and a tap on
    // bare board means the same thing it means with a mouse: nothing picked.
    // Only a pan that actually panned is allowed to leave the selection alone.
    const p = panRef.current
    if (p && p.pointerId === e.pointerId && !p.moved && selRef.current.length) select([])

    pointers.current.delete(e.pointerId)
    if (pointers.current.size < 2) pinchRef.current = null
    if (panRef.current?.pointerId === e.pointerId) panRef.current = null
    if (!pointers.current.size) panRef.current = null
  }
  endRef.current = endBoardPointer

  const atCentre = (next) => {
    const el = scrollRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    zoomAt(next, r.left + r.width / 2, r.top + r.height / 2)
  }

  // One picture gets a resize corner. A group does not: pulling a group out of
  // its own arrangement needs a different gesture than this corner means.
  const lone = selected.length === 1

  return (
    <main className="stage">
      <div
        className={`mood-scroll ${grabbing ? 'is-grabbing' : ''}`}
        ref={scrollRef}
        onPointerDown={onBoardPointerDown}
        onPointerMove={onBoardPointerMove}
        onPointerUp={endBoardPointer}
        onPointerCancel={endBoardPointer}
        onAuxClick={(e) => e.preventDefault()}
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
            style={{
              width: BOARD_W,
              height: BOARD_H,
              transform: `scale(${zoom})`
            }}
          >
            {moodboard.map((item) => {
              const at = pos[item.id] ?? item
              const picked = isSelected(item.id)
              return (
                <div
                  key={item.id}
                  className={`mood-item ${dragIds.includes(item.id) ? 'is-dragging' : ''} ${
                    picked ? 'is-selected' : ''
                  }`}
                  data-mood-id={item.id}
                  style={{
                    left: at.x,
                    top: at.y,
                    width: at.w,
                    height: at.h,
                    zIndex: item.z + 1
                  }}
                  onPointerDown={(e) => onImagePointerDown(e, item)}
                  onPointerMove={onImagePointerMove}
                  onPointerUp={onImagePointerUp}
                  onPointerCancel={onImagePointerUp}
                >
                  <img src={item.url} alt={item.file_name || ''} draggable={false} />
                  {/* The corner. Proportional always: a picture pulled out of
                      shape is a different picture. */}
                  {picked && lone && (
                    <span
                      className="mood-size"
                      title="Drag to resize"
                      onPointerDown={(e) => onResizePointerDown(e, item)}
                      onPointerMove={onImagePointerMove}
                      onPointerUp={onImagePointerUp}
                      onPointerCancel={onImagePointerUp}
                    />
                  )}
                  {picked && canRemove(item) && (
                    <button
                      className="icon-btn danger mood-remove"
                      title="Take this off the board"
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={() => setPending([item])}
                    >
                      <Trash width="13" height="13" />
                    </button>
                  )}
                </div>
              )
            })}

            {lasso && (
              <div
                className="mood-lasso"
                style={{
                  left: lasso.x,
                  top: lasso.y,
                  width: lasso.w,
                  height: lasso.h
                }}
              />
            )}

            {!moodboard.length && (
              <div className="mood-empty" style={{ left: BOARD_W / 2, top: BOARD_H / 2 }}>
                <h3>Nothing on the board yet</h3>
                <p>
                  Paste a screenshot, drop a file in, or add one below. Click a picture to pick it
                  up, drag across the board to pick out several, hold the middle mouse button or the
                  space bar to look around, scroll to zoom.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {selected.length > 1 && (
        <div className="mood-count" role="status">
          {selected.length} picked
        </div>
      )}

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
          title={
            pending.length > 1
              ? `Take ${pending.length} pictures off the board?`
              : 'Take this off the board?'
          }
          body={
            pending.length > 1
              ? 'They are removed for everyone. This cannot be undone.'
              : 'It is removed for everyone. This cannot be undone.'
          }
          confirmLabel="Remove"
          onCancel={() => setPending(null)}
          onConfirm={() => {
            const ids = pending.map((p) => p.id)
            if (ids.length > 1) actions.removeMoodboardImages(ids)
            else actions.removeMoodboardImage(ids[0])
            select(selRef.current.filter((id) => !ids.includes(id)))
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
