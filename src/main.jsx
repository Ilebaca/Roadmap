import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import appCss from './styles.css?inline'
import fontCss from './fonts.css?inline'

/**
 * Mounts the app, standalone or dropped into somebody else's page.
 *
 * It goes in a shadow root either way. Embedded in a Webflow page the app is a
 * guest on a layout it does not control: without the boundary, that site's
 * stylesheet reaches in and restyles every heading, button and input, and the
 * app's own rules reach out and restyle the page. The one code path means what
 * is tested standalone is what runs embedded.
 *
 * The host page supplies an element:
 *   <div id="roadmap-app"></div>
 *   <script type="module" src="https://.../assets/app.js"></script>
 */
const HOST_IDS = ['roadmap-app', 'root']

function findHost() {
  for (const id of HOST_IDS) {
    const el = document.getElementById(id)
    if (el) return el
  }
  // Nothing to mount into. Rather than fail silently in a page we cannot see,
  // say so where whoever pasted the embed will look.
  console.error(
    `[roadmap] No mount point. Add <div id="${HOST_IDS[0]}"></div> to the page before the script.`
  )
  return null
}

/** @font-face is ignored inside a shadow tree, so it has to go in the document. */
function installFont() {
  const ID = 'roadmap-font-face'
  if (document.getElementById(ID)) return
  const style = document.createElement('style')
  style.id = ID
  style.textContent = fontCss
  document.head.appendChild(style)
}

/**
 * The embed ends where the window does.
 *
 * `100dvh` in the stylesheet is right when the app starts at the top of the
 * page, which is the case on its own. Inside somebody else's page it may not
 * be: anything sitting above the embed pushes the app down by that much, the
 * app is still a whole window tall, and the page scrolls by the difference.
 * The running page is the only thing that knows the offset, so it is measured
 * here and taken off. An app that already starts at the top is left alone, and
 * keeps the stylesheet's own height.
 */
function fitHost(host) {
  const apply = () => {
    const top = Math.round(host.getBoundingClientRect().top + window.scrollY)
    host.style.height = top > 1 ? `${Math.max(320, window.innerHeight - top)}px` : ''
  }
  apply()
  window.addEventListener('resize', apply)
  window.addEventListener('orientationchange', apply)
  // A phone's address bar sliding away changes the window without a resize.
  window.visualViewport?.addEventListener('resize', apply)
}

const host = findHost()
if (host) {
  installFont()
  // A second run (a hot reload, or the script included twice) must not stack
  // two copies of the app on one element.
  const shadow = host.shadowRoot ?? host.attachShadow({ mode: 'open' })
  shadow.replaceChildren()

  const style = document.createElement('style')
  style.textContent = appCss
  shadow.appendChild(style)

  const mount = document.createElement('div')
  mount.style.height = '100%'
  shadow.appendChild(mount)

  createRoot(mount).render(
    <StrictMode>
      <App />
    </StrictMode>
  )

  fitHost(host)
}
