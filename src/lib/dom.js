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
