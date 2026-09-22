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
  { slug: 'logo-system', title: 'Logo system', blurb: 'Primary lockup, its variants, clear space, minimum sizes, and the things not to do with it.' },
  { slug: 'color-palette', title: 'Color palette', blurb: 'Primary, secondary and support colours with their values, pairings and contrast rules.' },
  { slug: 'typography-system', title: 'Typography system', blurb: 'Typefaces, the scale, weights, and how they set in print and on screen.' },
  { slug: 'visual-language', title: 'Visual language', blurb: 'Graphic devices, imagery, iconography, layout and the texture that ties it all together.' },
  { slug: 'ai-prompts-guide', title: 'AI prompts guide', blurb: 'Prompts, reference images and guardrails for generating work that stays on brand.' },
  { slug: 'brand-voice', title: 'Brand voice and messaging', blurb: 'How the brand sounds and what it says, with worked examples and words to avoid.' },
  { slug: 'downloadables', title: 'Downloadables', blurb: 'Every asset packaged up, ready to hand to whoever needs it.' },

  // Not part of the default set, but available when a client needs one.
  { slug: 'photography', title: 'Photography', blurb: 'Art direction, treatment, and a shot library to pull from.' },
  { slug: 'mockups', title: 'Mockups', blurb: 'The brand applied — packaging, signage, social, stationery.' },
  { slug: 'motion', title: 'Motion', blurb: 'Timing, easing and the standard transitions.' }
]

/** What every new client's Visual Identity is created with, in this order. */
export const DEFAULT_TEMPLATE_SLUGS = [
  'logo-system',
  'color-palette',
  'typography-system',
  'visual-language',
  'ai-prompts-guide',
  'brand-voice',
  'downloadables'
]

export const templateBySlug = (slug) => BRAND_TEMPLATES.find((t) => t.slug === slug) ?? null
