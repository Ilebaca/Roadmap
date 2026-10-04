/**
 * Did this event happen inside `el`?
 *
 * `el.contains(e.target)` is the obvious answer and it is wrong here. The app
 * runs inside a shadow root when it is embedded in a page, and an event that
 * crosses that boundary is retargeted: by the time a listener on `document`
 * sees it, `e.target` has been rewritten to the shadow host, so every click
 * inside a menu reads as a click outside it and the menu shuts itself.
 * `composedPath()` is the path before retargeting, which is what we actually
 * want to ask about.
 */
export function eventInside(el, e) {
  if (!el) return false
  const path = typeof e.composedPath === 'function' ? e.composedPath() : null
  return path ? path.includes(el) : el.contains(e.target)
}

/**
 * The layer anything floating is rendered into.
 *
 * A menu or a calendar is `position: fixed`, which keeps it out of the card's
 * own scrolling and clipping — but not out of its stacking order. A card is
 * painted in document order, so a popup belonging to the card on the left is
 * still part of that card's subtree and is painted under the card on the
 * right, whatever z-index it is given. It looked like a calendar sliding under
 * the task beside it, because that is exactly what it was.
 *
 * So floating things are portalled out of the card and into one layer at the
 * end of the app's own root, where there is nothing left to be painted over
 * by. The layer is found from an element already in the tree, so it lands
 * inside the shadow root when the app is embedded in somebody's page and in
 * the document when it is not.
 */
export function overlayLayer(from) {
  const root = from?.getRootNode?.()
  const host = root && root.nodeType === 11 ? root : document.body // 11 = DocumentFragment, i.e. a shadow root
  if (!host) return null
  let layer = host.querySelector(':scope > .overlay-layer')
  if (!layer) {
    layer = document.createElement('div')
    layer.className = 'overlay-layer'
    host.appendChild(layer)
  }
  return layer
}
