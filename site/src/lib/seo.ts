/*
 * Titles and structured data, for search engines rather than for readers.
 *
 * The head on every page already had a canonical, a description and the
 * social card. What it did not have was a title in the words anybody types,
 * or any statement of what the page is and whose it is that a crawler could
 * read as data. An item page was titled "DecodeText: Beamish", which is the
 * name of a thing nobody has heard of followed by the name of a site nobody
 * has heard of.
 *
 * Nothing here is written per page. The title comes from meta.json, either an
 * explicit `seoTitle` or the first clause of the description, and the
 * structured data from the same fields the page already renders.
 */

export const SITE_URL = 'https://beamish.ink'
export const SITE_NAME = 'Beamish'
export const SITE_DESCRIPTION =
  'Open source web effects, landing page templates and CSS grids, delivered as prompts for AI coding agents'
export const REPOSITORY = 'https://github.com/OscarBeamish/beamish.ink'

/*
 * The same @id as the Person on oscarbeamish.com. An @id is a name for a node,
 * not a link to a page, and two documents that use the same one are talking
 * about the same person. That is the whole mechanism by which this site and
 * the business site end up attached to each other in a search engine's graph.
 */
export const PERSON_ID = 'https://oscarbeamish.com/#person'
export const WEBSITE_ID = `${SITE_URL}/#website`

const MIT = 'https://opensource.org/licenses/MIT'

/*
 * 60 characters is where a results page starts cutting a title off. The brand
 * goes last, after a pipe, so what gets cut is the brand and not the words
 * that said what the page is.
 */
const TITLE_LIMIT = 60
const TITLE_SUFFIX = ` | ${SITE_NAME}`

export function canonicalFor(pathname: string): string {
  return new URL(pathname, SITE_URL).href
}

/**
 * `Name: descriptor | Beamish`, where the descriptor is `seoTitle` from
 * meta.json when there is one and the first clause of the description when
 * there is not, cut to the last whole word that keeps the title inside the
 * limit. The name stays first: it is the H1, and a title that does not open
 * with the H1 reads as a different page.
 */
export function pageTitle(name: string, description: string, seoTitle?: string): string {
  const room = TITLE_LIMIT - name.length - 2 - TITLE_SUFFIX.length
  const descriptor = seoTitle ?? firstClause(description, room)
  return `${name}: ${descriptor}${TITLE_SUFFIX}`
}

/*
 * Words a cut title must not end on. "A twelve column editorial grid of" is
 * a sentence stopped mid-breath; "A twelve column editorial grid" is a title.
 */
const DANGLING = new Set([
  'a', 'an', 'the', 'of', 'in', 'on', 'at', 'to', 'by', 'for', 'with', 'and', 'or', 'as',
  'that', 'which', 'from', 'into', 'over', 'under', 'than', 'its', 'their', 'your'
])

function firstClause(description: string, room: number): string {
  const clause = (description.split(/[,:;]/)[0] ?? description).trim()
  if (clause.length <= room) return clause
  const words = clause.split(' ')
  while (words.length > 1 && words.join(' ').length > room) words.pop()
  while (words.length > 1 && DANGLING.has(words[words.length - 1]!.toLowerCase())) words.pop()
  const cut = words.join(' ')
  return (cut.length > room ? cut.slice(0, room) : cut).replace(/[\s.,]+$/, '')
}

type Node = Record<string, unknown>

const PERSON: Node = {
  '@type': 'Person',
  '@id': PERSON_ID,
  name: 'Oscar Beamish',
  url: 'https://oscarbeamish.com/'
}

const WEBSITE: Node = {
  '@type': 'WebSite',
  '@id': WEBSITE_ID,
  url: `${SITE_URL}/`,
  name: SITE_NAME,
  description: SITE_DESCRIPTION,
  inLanguage: 'en-GB',
  author: { '@id': PERSON_ID },
  publisher: { '@id': PERSON_ID }
}

export type SourceCodeInput = {
  name: string
  description: string
  /** Astro.url.pathname. Made absolute here, against the site URL. */
  pathname: string
  keywords?: string[]
  programmingLanguage: 'TypeScript' | 'CSS' | 'HTML'
  /** For a template adapted from somebody else's page: where it came from. */
  basedOn?: string
}

/**
 * One item as a SoftwareSourceCode node: what it is, where the source lives,
 * what it is written in, who wrote it and under what licence. Everything an
 * effect, a grid or a template has in common, from the fields meta.json
 * already carries.
 */
export function sourceCodeSchema(input: SourceCodeInput): Node {
  const node: Node = {
    '@type': 'SoftwareSourceCode',
    name: input.name,
    description: input.description,
    url: canonicalFor(input.pathname),
    codeRepository: REPOSITORY,
    programmingLanguage: input.programmingLanguage,
    license: MIT,
    author: { '@id': PERSON_ID },
    isPartOf: { '@id': WEBSITE_ID }
  }
  if (input.keywords && input.keywords.length > 0) node['keywords'] = input.keywords.join(', ')
  if (input.basedOn) node['isBasedOn'] = input.basedOn
  return node
}

/**
 * The whole graph for a page as a JSON string ready for a `<script
 * type="application/ld+json">`. `<` is escaped so a description can never
 * close the script element early.
 */
export function jsonLd(nodes: Node[]): string {
  const graph = { '@context': 'https://schema.org', '@graph': [PERSON, WEBSITE, ...nodes] }
  return JSON.stringify(graph).replaceAll('<', '\\u003c')
}
