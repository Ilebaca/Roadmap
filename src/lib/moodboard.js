/**
 * What a mood board agrees on, wherever it is running.
 *
 * The size cap lives here rather than in the component so the limit the file
 * picker enforces and the limit the data layer enforces cannot drift apart —
 * a file that passes one and fails the other is a file that vanishes.
 */

/** One megabyte, as the file system counts it. */
export const MAX_IMAGE_BYTES = 1024 * 1024

export const MAX_IMAGE_LABEL = '1 MB'

/** How big a picture is drawn when it first lands, longest side in px. */
export const DROP_SIZE = 300

/** The board itself: big enough to spread out on, small enough to find things. */
export const BOARD_W = 3200
export const BOARD_H = 2200

export const prettyBytes = (n) =>
  n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`

/**
 * The one sentence every refusal uses, so the rule reads the same whether it
 * was the picker or the server that said no.
 */
export const tooBigMessage = (file) =>
  `“${file.name}” is ${prettyBytes(file.size)}. Images on the board have to be ${MAX_IMAGE_LABEL} or smaller.`

/** Everything a browser will actually paint. */
export const ACCEPTED = 'image/png,image/jpeg,image/webp,image/gif,image/avif'

export function isImage(file) {
  return !!file && /^image\//.test(file.type)
}

/**
 * The size to draw an image at when it lands: the longest side at DROP_SIZE,
 * the shape kept. A board of pictures all the same width reads as a grid, and
 * a mood board is not a grid.
 */
export function dropSize(naturalW, naturalH) {
  const w = naturalW || DROP_SIZE
  const h = naturalH || DROP_SIZE
  const scale = DROP_SIZE / Math.max(w, h)
  return { w: Math.round(w * scale), h: Math.round(h * scale) }
}

/** Keeps an image on the board however hard it is thrown at the edge. */
export function clampToBoard(x, y, w, h) {
  return {
    x: Math.min(Math.max(0, x), BOARD_W - w),
    y: Math.min(Math.max(0, y), BOARD_H - h)
  }
}

/**
 * Make a picture fit the limit rather than turning it away.
 *
 * A screenshot off a modern display is three or four megabytes, so a board you
 * paste screenshots onto and a hard 1 MB cap are the same feature arguing with
 * itself. The cap is about what the board costs to store, not about which
 * pictures are allowed on it — so anything over it is re-encoded smaller until
 * it fits, and only something that still will not fit is refused.
 *
 * Tried widest-and-best first, so a picture gives up as little as it has to.
 * Returns the original untouched when it was already small enough.
 */
export async function fitToLimit(file) {
  if (file.size <= MAX_IMAGE_BYTES) return { file, shrunk: false }

  let bitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    return null // not something this browser can decode, so not something to shrink
  }

  // WebP is smaller at the same quality; JPEG is what a browser without it
  // will give instead. Neither keeps transparency, which a photograph or a
  // screenshot does not have anyway — and a PNG that big usually is one.
  for (const maxEdge of [2400, 1800, 1400, 1100, 880, 700]) {
    for (const [type, quality] of [['image/webp', 0.86], ['image/webp', 0.72], ['image/jpeg', 0.82], ['image/jpeg', 0.66]]) {
      const blob = await encode(bitmap, maxEdge, type, quality)
      if (blob && blob.size <= MAX_IMAGE_BYTES) {
        bitmap.close?.()
        return {
          file: new File([blob], renameFor(file.name, blob.type), { type: blob.type }),
          shrunk: true,
          from: file.size,
          to: blob.size
        }
      }
    }
  }
  bitmap.close?.()
  return null
}

function encode(bitmap, maxEdge, type, quality) {
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height))
  const w = Math.max(1, Math.round(bitmap.width * scale))
  const h = Math.max(1, Math.round(bitmap.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) return Promise.resolve(null)
  ctx.drawImage(bitmap, 0, 0, w, h)
  return new Promise((resolve) => {
    // A browser that cannot encode the type asked for hands back a PNG, which
    // will simply be too big and fall through to the next attempt.
    canvas.toBlob((b) => resolve(b && b.type === type ? b : null), type, quality)
  })
}

const renameFor = (name, type) => {
  const stem = name.replace(/\.[^.]+$/, '') || 'image'
  return `${stem}.${type === 'image/webp' ? 'webp' : 'jpg'}`
}

/** What to tell someone whose picture had to be made smaller to go up. */
export const shrunkMessage = (r) =>
  `That image was ${prettyBytes(r.from)}, so it went up at ${prettyBytes(r.to)} to stay under ${MAX_IMAGE_LABEL}.`

/**
 * The images on a clipboard, if any. A screenshot arrives as a file with no
 * useful name; copied text and copied HTML arrive alongside it and are not
 * ours. Returns [] for a paste that carried no picture, so a plain text paste
 * is simply ignored rather than being an error.
 */
export function imagesFromClipboard(data) {
  if (!data) return []
  const out = []
  for (const item of data.items ?? []) {
    if (item.kind !== 'file') continue
    const file = item.getAsFile()
    if (file && isImage(file)) out.push(file)
  }
  if (out.length) return out
  return [...(data.files ?? [])].filter(isImage)
}
