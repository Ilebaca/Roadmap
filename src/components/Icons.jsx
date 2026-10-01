export const Plus = (p) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" {...p}>
    <path d="M12 5v14M5 12h14" />
  </svg>
)

export const Lock = (p) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}>
    <rect x="4" y="10" width="16" height="10" rx="2.5" />
    <path d="M8 10V7a4 4 0 0 1 8 0v3" />
  </svg>
)

export const Check = (p) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" {...p}>
    <path d="M4 12.5 9.5 18 20 6.5" />
  </svg>
)

export const Trash = (p) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}>
    <path d="M4 7h16M10 7V5h4v2M6 7l1 13h10l1-13" />
  </svg>
)

export const Grip = (p) => (
  <svg viewBox="0 0 24 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" {...p}>
    <path d="M7 3h10" />
  </svg>
)

export const Users = (p) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}>
    <circle cx="9" cy="8" r="3.2" />
    <path d="M3.5 19a5.5 5.5 0 0 1 11 0M16 5.5a3 3 0 0 1 0 5M17.5 19a5.2 5.2 0 0 0-2.2-4.2" />
  </svg>
)

export const Pen = (p) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}>
    <path d="M16.5 4.5a2.12 2.12 0 0 1 3 3L8 19l-4 1 1-4Z" />
  </svg>
)

export const Link = (p) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" {...p}>
    <path d="M10 13.5a4 4 0 0 0 5.7.3l3-3a4 4 0 0 0-5.7-5.7l-1.6 1.6" />
    <path d="M14 10.5a4 4 0 0 0-5.7-.3l-3 3a4 4 0 0 0 5.7 5.7l1.6-1.6" />
  </svg>
)

export const X = (p) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" {...p}>
    <path d="M6 6l12 12M18 6 6 18" />
  </svg>
)

export const Chevron = (p) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" {...p}>
    <path d="m6 9 6 6 6-6" />
  </svg>
)

/** App rail — the roadmap: a date line with two stops on it. */
export const RoadmapGlyph = (p) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}>
    <path d="M12 4v16" />
    <circle cx="12" cy="8" r="2.4" fill="currentColor" stroke="none" />
    <circle cx="12" cy="16.5" r="2.4" />
    <path d="M15.5 8h3.5M15.5 16.5h3.5M5 8h1.5M5 16.5h1.5" />
  </svg>
)

/** App rail — the brand delivery system: stacked, handed-over assets. */
export const BrandGlyph = (p) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}>
    <path d="M12 3.5 20 8l-8 4.5L4 8Z" />
    <path d="m4 12 8 4.5L20 12" />
    <path d="m4 16 8 4.5L20 16" />
  </svg>
)

/** App rail — the mood board: loose pictures pinned up, overlapping. */
export const MoodGlyph = (p) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}>
    <rect x="3" y="6.5" width="10" height="8" rx="1.4" transform="rotate(-7 8 10.5)" />
    <rect x="11" y="9.5" width="10" height="8.5" rx="1.4" transform="rotate(6 16 13.75)" />
  </svg>
)

export const Download = (p) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}>
    <path d="M12 4v11m0 0 4-4m-4 4-4-4" />
    <path d="M5 19h14" />
  </svg>
)

export const ArrowUp = (p) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}>
    <path d="M12 19V6m0 0-6 6m6-6 6 6" />
  </svg>
)

export const TextGlyph = (p) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" {...p}>
    <path d="M5 6h14M5 11h14M5 16h9" />
  </svg>
)

export const ImageGlyph = (p) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}>
    <rect x="3.5" y="5" width="17" height="14" rx="2.5" />
    <circle cx="9" cy="10" r="1.6" />
    <path d="m4.5 17 4.5-4.5 3.5 3.5 2.5-2.5 4.5 4.5" />
  </svg>
)

export const ZipGlyph = (p) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}>
    <path d="M5 4.5h9l5 5V19a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 5 19Z" />
    <path d="M14 4.5V10h5" />
    <path d="M9.5 6.5h1.5M9.5 9h1.5M9.5 11.5h1.5M9.5 14h1.5" />
  </svg>
)

export const HeadingGlyph = (p) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" {...p}>
    <path d="M5 7h14" strokeWidth="3" />
    <path d="M5 13h14M5 17h9" strokeWidth="1.6" />
  </svg>
)

/** Two or three columns, depending on `cols`. */
export const GridGlyph = ({ cols = 2, ...p }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...p}>
    {cols === 3 ? (
      <>
        <rect x="2.5" y="6" width="5.6" height="12" rx="1.6" />
        <rect x="9.2" y="6" width="5.6" height="12" rx="1.6" />
        <rect x="15.9" y="6" width="5.6" height="12" rx="1.6" />
      </>
    ) : (
      <>
        <rect x="2.5" y="6" width="8.6" height="12" rx="1.8" />
        <rect x="12.9" y="6" width="8.6" height="12" rx="1.8" />
      </>
    )}
  </svg>
)

export const GripGlyph = (p) => (
  <svg viewBox="0 0 24 24" fill="currentColor" {...p}>
    <circle cx="9" cy="6" r="1.6" />
    <circle cx="15" cy="6" r="1.6" />
    <circle cx="9" cy="12" r="1.6" />
    <circle cx="15" cy="12" r="1.6" />
    <circle cx="9" cy="18" r="1.6" />
    <circle cx="15" cy="18" r="1.6" />
  </svg>
)

/** Time has passed — used where a block has run beyond its deadline. */
export const Clock = (p) => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...p}>
    <circle cx="8" cy="8" r="6" />
    <path d="M8 4.8V8l2.2 1.4" />
  </svg>
)

export const SignOut = (p) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}>
    <path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4" />
    <path d="M10 8 6 12l4 4M6 12h10" />
  </svg>
)

/**
 * The studio's mark, traced from the artwork itself.
 *
 * One path with the ring cut out of it and the dot set back inside, filled
 * even-odd, so the hole is whatever is behind the mark — the dark ground in
 * the topbar, a panel anywhere else — and it never carries a patch of the
 * wrong colour around with it. `currentColor` so it takes the accent from
 * whatever it is sitting in.
 */
export const Mark = (p) => (
  <svg viewBox="0 0 92.94 100" fill="none" {...p}>
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      fill="currentColor"
      d="M35.88 91.2L35.88 82.41 L33.68 82.04C23.41 80.31 16.23 76.86 9.94 70.61C2.25 62.97 0.02 56.42 0.02 41.47C0.02 27.43 2.14 20.53 8.6 13.56C16.96 4.52 29.58 -0 46.4 0C63.2 0.01 75.11 3.89 83.31 12.05C87.47 16.18 90.16 21.08 91.8 27.51C93.25 33.15 93.39 47.73 92.06 53.39C89.3 65.07 79.9 74.05 66.03 78.24C63.68 78.95 61.76 79.64 61.76 79.78C61.76 79.92 62.72 80.88 63.9 81.91C65.69 83.48 76.47 98.73 76.47 99.69C76.47 99.86 67.34 100 56.18 100L35.88 100 L35.88 91.2ZM54.41 58.32C68.73 51.53 68.99 31.55 54.85 24.59C51.35 22.87 50.37 22.65 46.19 22.68C42.28 22.71 40.96 22.98 38.47 24.26C34.04 26.55 32.18 28.34 30 32.44C24.35 43.03 29.69 55.94 41.18 59.45C41.99 59.7 44.5 59.92 46.76 59.95C50.14 59.99 51.52 59.7 54.41 58.32ZM43.91 44.22C41.8 41.89 43.43 38.24 46.57 38.24C49.59 38.24 51.16 42.3 48.92 44.32C47.5 45.61 45.13 45.56 43.91 44.22Z"
    />
  </svg>
)
