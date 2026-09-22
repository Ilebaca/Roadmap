/**
 * The standard Visual Identity categories.
 *
 * Every client starts from this catalogue, so two clients' systems are laid out
 * the same way. Each one is a starting point, not a fixture: an admin renames
 * them, rewrites what they are for, removes the ones a client does not need and
 * adds categories of their own.
 *
 * BACKEND: this stays in the codebase as the seed catalogue. The rows it
 * creates live in `brand_sections` (id, project_id, slug, title, blurb,
 * template, order_index), and the assets inside them in `brand_assets`
 * (id, section_id, kind, title, file_path -> Supabase Storage, order_index).
 */
export const BRAND_TEMPLATES = [
  { slug: 'logo', title: 'Logo', blurb: 'Primary lockup, variants, clear space, and the things not to do with it.' },
  { slug: 'typography', title: 'Typography', blurb: 'Typefaces, the scale, weights, and how they pair in print and on screen.' },
  { slug: 'colors', title: 'Colours', blurb: 'Primary, secondary and support palettes with their values and contrast pairs.' },
  { slug: 'photography', title: 'Photography', blurb: 'Art direction, treatment, and a shot library to pull from.' },
  { slug: 'mockups', title: 'Mockups', blurb: 'The brand applied — packaging, signage, social, stationery.' },
  { slug: 'iconography', title: 'Iconography', blurb: 'The icon set, its grid, and the rules for drawing new ones.' },
  { slug: 'ai-guide', title: 'AI Guide', blurb: 'Prompts, reference images and guardrails for generating on-brand work.' },
  { slug: 'voice', title: 'Tone of Voice', blurb: 'How the brand sounds, with worked examples and words to avoid.' },
  { slug: 'motion', title: 'Motion', blurb: 'Timing, easing and the standard transitions.' },
  { slug: 'downloads', title: 'Downloads', blurb: 'Every asset packaged up, ready to hand to whoever needs it.' }
]

/** The set a new client's system is created with. */
export const DEFAULT_TEMPLATE_SLUGS = ['logo', 'typography', 'colors', 'photography', 'mockups', 'ai-guide']

export const templateBySlug = (slug) => BRAND_TEMPLATES.find((t) => t.slug === slug) ?? null
