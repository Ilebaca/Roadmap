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
