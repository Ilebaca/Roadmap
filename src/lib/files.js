/**
 * File handling for the mock layer.
 *
 * With no backend, an uploaded file is read into a data URL and kept in the
 * same local snapshot as everything else, which is why there is a size cap:
 * browser storage is a few megabytes in total.
 *
 * BACKEND: the picker hands the File straight to
 *   supabase.storage.from('brand-assets').upload(path, file)
 * and the row keeps that path instead of the data URL. The cap then becomes
 * whatever the bucket allows, and downloads go through a signed URL.
 */
import { isLive } from '../services/supabaseClient'

export const MAX_UPLOAD_BYTES = 2 * 1024 * 1024 // 2 MB while we are local

export const formatBytes = (n) => {
  if (!n && n !== 0) return ''
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

export class FileTooLargeError extends Error {
  constructor(size) {
    super(
      `That file is ${formatBytes(size)}. While there is no backend, uploads are kept in the browser and capped at ${formatBytes(MAX_UPLOAD_BYTES)}.`
    )
    this.name = 'FileTooLargeError'
  }
}

/**
 * With a real backend behind it there is no cap worth enforcing here — the
 * bucket decides. Only the mock, which keeps files in this browser, needs one.
 */
export function checkSize(file) {
  if (!isLive && file.size > MAX_UPLOAD_BYTES) throw new FileTooLargeError(file.size)
  return file
}

/** Read a picked File into a data URL, refusing anything too big to keep. */
export function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    if (file.size > MAX_UPLOAD_BYTES) return reject(new FileTooLargeError(file.size))
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('That file could not be read.'))
    reader.onload = () =>
      resolve({ url: reader.result, file_name: file.name, file_size: file.size })
    reader.readAsDataURL(file)
  })
}

/** "example.com" from a URL, for the line under a link. */
export const hostOf = (url = '') => {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

export const withProtocol = (url = '') =>
  /^https?:\/\//i.test(url.trim()) ? url.trim() : `https://${url.trim()}`
