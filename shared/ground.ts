/*
 * What is actually behind this effect.
 *
 * Items that paint their own ground used to default it to #fbfaf4, the warm
 * paper the site happened to be. That one default is most of what made the
 * library a paper library: an effect dropped onto a dark page painted a cream
 * rectangle over it and looked broken, so in practice it only worked on one
 * kind of page, whatever its metadata said.
 *
 * `auto` asks the page instead. The item adopts whatever it has been put on,
 * which is the behaviour people expected from a default in the first place.
 *
 * It costs nothing to keep the old look: on a page whose ground is the paper
 * token this resolves to rgb(251, 250, 244), which is #fbfaf4 to the byte, so
 * every existing demo renders exactly as it did and no recorded take is
 * invalidated by the change.
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

/**
 * Resolve every `auto` colour option against the page, once, at mount.
 *
 * Done here rather than in each item because there is nothing item-specific
 * about it. Sixteen effects paint a ground and each reads its option in its
 * own shape, as a uniform, a THREE.Color or a cached vector, so patching them
 * one at a time would be sixteen chances to put a getComputedStyle inside a
 * render loop. The runtime already holds the host element and already merges
 * the options, so it is the one place that knows both.
 *
 * One word is understood: `auto` is the page's background. A matching word for
 * the ink was tried and dropped, because taking the mark colour from the page
 * text gave pure black on paper, which this library deliberately does not use
 * as ink, and still left the marks invisible on black. Ink wants designing per
 * item, not deriving.
 *
 * It runs on update too, which is what makes a ground change at runtime work:
 * re-pass the option and the item picks up the new page.
 */
export function resolveAutoGrounds<O extends object>(el: HTMLElement, opts: O): O {
  let ground: string | null = null
  let next: Record<string, unknown> | null = null

  for (const [key, value] of Object.entries(opts)) {
    if (typeof value !== 'string' || value.trim().toLowerCase() !== 'auto') continue
    // Read the page at most once, however many options asked for it.
    ground ??= pageGround(el)
    next ??= { ...(opts as Record<string, unknown>) }
    next[key] = ground
  }

  return (next ?? opts) as O
}
