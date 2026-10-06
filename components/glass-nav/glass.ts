/*
 * The glass itself, shared by the React and the Vue component so the two
 * cannot drift. Nothing here knows about either framework.
 *
 * Two jobs: work out how far the page has scrolled past the bar, and build the
 * displacement map that bends what is behind it.
 */

/** How far the bar has settled, 0 at the top of the page and 1 once past it. */
export function watchSettle(el: HTMLElement, over = 120): () => void {
  let frame = 0
  let last = -1

  const measure = () => {
    frame = 0
    const settled = Math.min(Math.max(window.scrollY / Math.max(over, 1), 0), 1)
    // Two decimal places. A custom property written sixty times a second with
    // fifteen digits of float is a style recalculation per frame for a change
    // nobody can see.
    const rounded = Math.round(settled * 100) / 100
    if (rounded === last) return
    last = rounded
    el.style.setProperty('--crossbar-settle', String(rounded))
  }

  const onScroll = () => {
    if (frame) return
    frame = requestAnimationFrame(measure)
  }

  measure()
  window.addEventListener('scroll', onScroll, { passive: true })
  return () => {
    if (frame) cancelAnimationFrame(frame)
    window.removeEventListener('scroll', onScroll)
  }
}

/*
 * A normal map for a rounded rectangle, as a data URI.
 *
 * feDisplacementMap moves each pixel of the backdrop by
 * scale * (channel / 255 - 0.5), so a map that is flat grey displaces nothing
 * and the interesting part is entirely in how it departs from grey. What we
 * want is a lens: no displacement through the middle, and an outward push that
 * grows towards the edge, in the direction the edge faces.
 *
 * That direction is the gradient of the signed distance field, which for a
 * rounded rectangle has a closed form, so it is computed rather than painted
 * with gradients and guessed at. The push is weighted by how close the point is
 * to the edge, which is what makes it a bevel rather than a uniform stretch.
 */
export function makeLensMap(width: number, height: number, radius: number, thickness: number): string {
  const canvas = document.createElement('canvas')
  // A quarter scale is plenty. The map is a smooth field and feImage will
  // resample it; a full-size one costs four times the pixels for no difference.
  const w = Math.max(Math.round(width / 4), 1)
  const h = Math.max(Math.round(height / 4), 1)
  canvas.width = w
  canvas.height = h

  const ctx = canvas.getContext('2d')
  if (!ctx) return ''

  const image = ctx.createImageData(w, h)
  const halfW = w / 2
  const halfH = h / 2
  const r = Math.min(radius / 4, Math.min(halfW, halfH))
  const edge = Math.max(thickness / 4, 1)

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      // Signed distance to a rounded rectangle, negative inside.
      const qx = Math.abs(x + 0.5 - halfW) - (halfW - r)
      const qy = Math.abs(y + 0.5 - halfH) - (halfH - r)
      const ox = Math.max(qx, 0)
      const oy = Math.max(qy, 0)
      const dist = Math.hypot(ox, oy) + Math.min(Math.max(qx, qy), 0) - r

      // The outward direction. Inside the straight runs one of these is zero,
      // which is correct: a flat edge bends light one way only.
      const nx = qx > qy ? Math.sign(x + 0.5 - halfW) : 0
      const ny = qy >= qx ? Math.sign(y + 0.5 - halfH) : 0
      let dirX = ox !== 0 || oy !== 0 ? ox * Math.sign(x + 0.5 - halfW) : nx
      let dirY = ox !== 0 || oy !== 0 ? oy * Math.sign(y + 0.5 - halfH) : ny
      const len = Math.hypot(dirX, dirY) || 1
      dirX /= len
      dirY /= len

      // Nothing through the middle, everything at the rim.
      const bevel = Math.min(Math.max(1 + dist / edge, 0), 1)

      const i = (y * w + x) * 4
      image.data[i] = Math.round((dirX * bevel * 0.5 + 0.5) * 255)
      image.data[i + 1] = Math.round((dirY * bevel * 0.5 + 0.5) * 255)
      image.data[i + 2] = 0
      image.data[i + 3] = 255
    }
  }

  ctx.putImageData(image, 0, 0)
  return canvas.toDataURL()
}

let filterSeq = 0

/**
 * Attach a backdrop refraction to an element, and return the teardown.
 *
 * Chromium only. Safari does not apply SVG filters in `backdrop-filter` at all,
 * and Firefox parses the value, passes an `@supports` test and then renders
 * nothing, so there is no feature query that tells the truth here. What every
 * browser does get is the blur and the edge, which is most of the effect.
 */
export function attachRefraction(el: HTMLElement, strength: number, radius: number): () => void {
  const id = `beamish-lens-${(filterSeq += 1)}`

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('aria-hidden', 'true')
  svg.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden'
  svg.innerHTML =
    `<filter id="${id}" x="0%" y="0%" width="100%" height="100%" color-interpolation-filters="sRGB">` +
    `<feImage result="lens" preserveAspectRatio="none" />` +
    `<feDisplacementMap in="SourceGraphic" in2="lens" xChannelSelector="R" yChannelSelector="G" />` +
    `</filter>`
  document.body.append(svg)

  const feImage = svg.querySelector('feImage')!
  const feDisplacement = svg.querySelector('feDisplacementMap')!

  const draw = () => {
    const rect = el.getBoundingClientRect()
    if (rect.width < 2 || rect.height < 2) return
    const map = makeLensMap(rect.width, rect.height, radius, Math.min(rect.height, 48))
    if (!map) return
    feImage.setAttribute('href', map)
    feImage.setAttribute('width', String(rect.width))
    feImage.setAttribute('height', String(rect.height))
    feDisplacement.setAttribute('scale', String(strength))
  }

  draw()
  const previous = el.style.filter
  el.style.setProperty('--crossbar-lens', `url(#${id})`)

  const observer = new ResizeObserver(draw)
  observer.observe(el)

  return () => {
    observer.disconnect()
    svg.remove()
    el.style.removeProperty('--crossbar-lens')
    el.style.filter = previous
  }
}
