/*
 * What is actually behind this effect, and what to paint on it.
 *
 * Items that paint their own ground used to default it to #fbfaf4, the warm
 * paper the site happened to be. That one default is most of what made the
 * library a paper library: an effect dropped onto a dark page painted a cream
 * rectangle over it and looked broken, so in practice it only worked on one
 * kind of page, whatever its metadata said.
 *
 * Two words fix that, and they are deliberately the two CSS already has.
 *
 * `auto` is the page's own background. The item adopts whatever it has been
 * put on, which is what people expected a default to do.
 *
 * `light-dark(a, b)` is a colour chosen by the ground it will sit on, spelled
 * the way the CSS function of the same name spells it. This is for the marks
 * rather than the ground, and it exists because deriving them does not work:
 * taking the mark colour from the page's text gave pure black on paper, which
 * this library does not use as ink, and still left the marks invisible on
 * black. A mark colour is a design decision for each ground, so the item makes
 * both decisions and the page picks.
 *
 * Neither costs anything to adopt. On a paper page `auto` resolves to
 * rgb(251, 250, 244), which is #fbfaf4 to the byte, and `light-dark()` returns
 * its first value, so an item keeps exactly the rendering it had and no
 * recorded take is invalidated.
 */

/** The first real background painted at or above `el`, as `rgb(r, g, b)`. */
export function pageGround(el: HTMLElement): string {
  for (let node: Element | null = el; node; node = node.parentElement) {
    const colour = getComputedStyle(node).backgroundColor
    if (isPainted(colour)) return colour
  }

  /*
   * Nothing in the chain paints. The root still has a used value even when no
   * stylesheet sets one, and it is what the viewport is actually showing.
   */
  const root = getComputedStyle(document.documentElement).backgroundColor
  if (isPainted(root)) return root

  const body = document.body && getComputedStyle(document.body).backgroundColor
  if (body && isPainted(body)) return body

  // A page that paints nothing is a white page, which is what the browser draws.
  return 'rgb(255, 255, 255)'
}

/**
 * An option that may be a colour or the string `auto`.
 *
 * Anything that is not `auto` is handed back untouched, so passing a colour
 * still wins and nothing has to know whether the default was taken.
 */
export function resolveGround(el: HTMLElement, value: string): string {
  return value.trim().toLowerCase() === 'auto' ? pageGround(el) : value
}

/** Whether a ground is dark enough to want light marks on it. */
export function isDarkGround(colour: string): boolean {
  return relativeLuminance(colour) < 0.5
}

/**
 * Resolve the ground-dependent options against the page, once, at mount.
 *
 * Done here rather than in each item because there is nothing item-specific
 * about it. Fifteen effects paint a ground and each reads its option in its
 * own shape, as a uniform, a THREE.Color, a cached vector or a scene
 * background, so patching them one at a time would be fifteen chances to put
 * a getComputedStyle inside a render loop. The runtime already holds the host
 * element and already merges the options, so it is the one place that knows
 * both.
 *
 * It runs on update too, which is what makes a ground change at runtime work:
 * re-pass the option and the item picks up the new page.
 */
export function resolveAutoGrounds<O extends object>(el: HTMLElement, opts: O): O {
  let ground: string | null = null
  let next: Record<string, unknown> | null = null

  // Read the page at most once, however many options end up asking for it.
  const page = () => (ground ??= pageGround(el))
  const write = (key: string, value: string) => {
    next ??= { ...(opts as Record<string, unknown>) }
    next[key] = value
  }

  for (const [key, value] of Object.entries(opts)) {
    if (typeof value !== 'string') continue
    const text = value.trim()
    const word = text.toLowerCase()

    if (word === 'auto') {
      write(key, page())
      continue
    }

    if (word.startsWith('light-dark(')) {
      const pair = splitPair(text)
      if (pair) write(key, isDarkGround(page()) ? pair[1] : pair[0])
    }
  }

  return (next ?? opts) as O
}

/*
 * The two arguments of light-dark(...), split on the comma that is not inside
 * a nested function, so rgb(0, 0, 0) survives being an argument.
 */
function splitPair(text: string): [string, string] | null {
  const open = text.indexOf('(')
  const close = text.lastIndexOf(')')
  if (open < 0 || close < open) return null

  const inner = text.slice(open + 1, close)
  let depth = 0
  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i]
    if (ch === '(') depth += 1
    else if (ch === ')') depth -= 1
    else if (ch === ',' && depth === 0) {
      return [inner.slice(0, i).trim(), inner.slice(i + 1).trim()]
    }
  }
  return null
}

/*
 * Transparent is not a colour the effect can paint with, and neither is a
 * fully transparent rgba, which is what every element that sets no background
 * computes to. Both mean "keep looking up the tree".
 */
function isPainted(colour: string): boolean {
  if (!colour || colour === 'transparent') return false
  const parts = colour.match(/[\d.]+/g)
  if (!parts) return false
  // rgba(...) with a fourth component of 0.
  return !(parts.length >= 4 && Number(parts[3]) === 0)
}

/** WCAG relative luminance, 0 to 1, from a hex or rgb() string. */
function relativeLuminance(colour: string): number {
  const [r, g, b] = toRgb(colour)
  const channel = (value: number) => {
    const c = value / 255
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  }
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

function toRgb(colour: string): [number, number, number] {
  const text = colour.trim()
  if (text.startsWith('#')) {
    const hex =
      text.length === 4
        ? text[1]! + text[1]! + text[2]! + text[2]! + text[3]! + text[3]!
        : text.slice(1, 7)
    const n = Number.parseInt(hex, 16)
    return Number.isNaN(n) ? [255, 255, 255] : [(n >> 16) & 255, (n >> 8) & 255, n & 255]
  }
  const parts = text.match(/[\d.]+/g)
  if (!parts || parts.length < 3) return [255, 255, 255]
  return [Number(parts[0]), Number(parts[1]), Number(parts[2])]
}
