You are adding **GlassNav** from Beamish to this project.

> A bar of glass across the top of a page, clear over a hero and frosted once it has scrolled. Navigation · component · MIT.
> https://beamish.ink/components/glass-nav

Beamish is not a package and there is nothing to install from npm. The source
lives in a public repo; you fetch the files, put them in this project, and wire
them in. Adapt them to whatever this project already uses. That is the point of
shipping it this way.

Assume you have not seen this library before. Everything you need is below.

## What it needs

- **npm dependencies:** `react@>=18`
- The blur is backdrop-filter, which every current browser supports. The refraction is an SVG filter inside backdrop-filter, which only Chromium applies: Safari ignores it and Firefox parses the value, passes an @supports test and then renders nothing, so there is no feature query that tells the truth
- What makes a panel read as glass rather than as tinted film is the hairline specular along its top edge, not the blur. Take that one line away and the rest is a grey rectangle
- The lens is a signed distance field for the rounded rectangle, computed per pixel into a canvas and handed to feImage. The displacement is the field's gradient weighted towards the edge, which is a bevel rather than a uniform stretch
- prefers-reduced-transparency turns the glass opaque and takes the specular with it, because a highlight on something that is not transparent is a lie about the material
- forced-colors throws out every background and shadow, so the bar falls back to a border, which is the one thing the mode keeps
- A nav landmark, a list, and links. The bar is markup rather than a widget, so the keyboard behaviour is the browser's
- The current page is marked with aria-current='page', which is also what the underline styling keys off, so what is announced and what is drawn cannot drift
- Contrast is the real risk. Glass over a photograph can put 2:1 text on the page without anybody noticing, which is why the tint comes up as the page scrolls under it rather than staying clear
- React 18+ or Vue 3. This one is a component, not an imperative effect.

Pinned to `{{PIN}}`. These URLs do not move; a future refactor gets a new tag.

## 1. Create these files

The full source is inlined below because you may not be able to fetch URLs.
Create each file at the path given, verbatim. Adjust the paths to match this
project's conventions, but keep them in the same relative arrangement. The
import between them is relative.

**`src/beamish/components/glass-nav/react.tsx`**

```tsx
/*
 * Crossbar: Beamish
 * https://beamish.ink/components/glass-nav
 *
 * A bar of glass across the top of a page. Nearly clear over a hero, settling
 * into frosted once the page has scrolled under it, because a bar that is
 * legible over a photograph and a bar that is legible over body copy are not
 * the same bar.
 *
 * Real markup underneath: a nav, a list, and links. The current page is marked
 * with aria-current, which is also what the styling keys off, so what is
 * announced and what is underlined cannot drift apart.
 */

'use client'

import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { watchSettle, attachRefraction } from './glass'
import './styles.css'

export type GlassNavItem = {
  label: string
  href: string
  /** Marks this one as the page you are on. */
  current?: boolean
}

export type GlassNavProps = {
  items: GlassNavItem[]
  /** Shown at the start of the bar. A string becomes a link to `brandHref`. */
  brand?: ReactNode
  brandHref?: string
  /** Pixels of scroll over which the glass settles from clear to frosted. */
  settleOver?: number
  /** Blur at full settle, in pixels. */
  blur?: number
  /** How milky it goes, 0 to 1. */
  tint?: number
  /**
   * Bend the backdrop as well as blurring it. Chromium only: see the recipe.
   * Everywhere else you get the blur and the edge, which is most of it.
   */
  refract?: boolean
  /** How far the rim bends what is behind it, in pixels. */
  refraction?: number
  /** Accessible name for the landmark, if the page has more than one nav. */
  label?: string
  className?: string
  children?: ReactNode
}

export function Crossbar({
  items,
  brand,
  brandHref = '/',
  settleOver = 120,
  blur = 14,
  tint = 0.55,
  refract = true,
  refraction = 18,
  label = 'Main',
  className,
  children
}: GlassNavProps) {
  const host = useRef<HTMLElement>(null)

  useEffect(() => {
    if (!host.current) return
    return watchSettle(host.current, settleOver)
  }, [settleOver])

  useEffect(() => {
    if (!host.current || !refract) return
    /*
     * Not under reduced transparency. The whole point of that setting is to
     * stop the backdrop coming through, and bending a backdrop you are about
     * to make opaque is work nobody asked for.
     */
    if (window.matchMedia('(prefers-reduced-transparency: reduce)').matches) return
    return attachRefraction(host.current, refraction, 100)
  }, [refract, refraction])

  return (
    <nav
      ref={host}
      aria-label={label}
      className={['beamish-glass-nav', className].filter(Boolean).join(' ')}
      style={
        {
          '--crossbar-blur': `${blur}px`,
          '--crossbar-tint': String(tint)
        } as React.CSSProperties
      }
    >
      {brand ? (
        <a className="beamish-glass-nav__brand" href={brandHref}>
          {brand}
        </a>
      ) : null}

      <ul className="beamish-glass-nav__list">
        {items.map(item => (
          <li key={item.href}>
            <a
              className="beamish-glass-nav__link"
              href={item.href}
              aria-current={item.current ? 'page' : undefined}
            >
              {item.label}
            </a>
          </li>
        ))}
      </ul>

      {children}
    </nav>
  )
}

export default Crossbar
```

**`src/beamish/components/glass-nav/glass.ts`**

```ts
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
```

**`src/beamish/components/glass-nav/styles.css`**

```text
/*
 * Crossbar: Beamish
 *
 * Every custom property has a fallback, so the component looks right dropped
 * into a project that has never heard of Beamish tokens. If the tokens are
 * present it inherits them instead, which is the whole point of shipping it
 * this way.
 *
 * Glass is three things and only one of them is the blur.
 *
 * The blur is what everybody writes and it is what makes a panel read as tinted
 * film. What makes it read as glass is the edge: a hairline specular highlight
 * along the top, where a real sheet catches the light, a rim that separates it
 * from whatever is behind, and a soft shadow underneath that says it is above
 * the page rather than part of it. Take the specular away and the rest of this
 * is a grey rectangle.
 *
 * The refraction is the fourth thing and it is optional, because it only works
 * in Chromium. See the recipe.
 */

.beamish-glass-nav {
  --crossbar-ink: var(--label-1, #26241f);
  --crossbar-quiet: var(--label-2, rgba(38, 36, 31, 0.62));
  --crossbar-accent: var(--accent, #c44400);
  --crossbar-ease: var(--ease-66, cubic-bezier(0.66, 0, 0.01, 1));

  /* Set by the component as you scroll, 0 at the top of the page to 1 once it
     has left it. Everything that settles, settles off this one number. */
  --crossbar-settle: 0;

  --crossbar-blur: 14px;
  --crossbar-tint: 0.55;

  position: relative;
  z-index: 10;
  display: flex;
  align-items: center;
  gap: clamp(1rem, 4vw, 2.5rem);
  padding: 0.75rem clamp(1rem, 3vw, 1.6rem);
  border-radius: 100px;
  isolation: isolate;

  font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
  font-size: 0.78rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--crossbar-ink);

  /*
   * Milkier as it settles. At the top of a page the bar is nearly clear,
   * because there is usually a hero behind it worth seeing; once it is over
   * body copy it has to earn its contrast.
   */
  background: rgba(255, 253, 247, calc(0.1 + var(--crossbar-tint) * var(--crossbar-settle)));

  /*
   * The lens is appended by the component when refraction is on, and the empty
   * fallback means the list is simply shorter when it is not. Order matters:
   * the backdrop is bent first and blurred after, which is what a thick piece
   * of glass does and the other way round smears the bend.
   */
  -webkit-backdrop-filter: var(--crossbar-lens, )
    blur(calc(var(--crossbar-blur) * var(--crossbar-settle)))
    saturate(calc(100% + 70% * var(--crossbar-settle)));
  backdrop-filter: var(--crossbar-lens, )
    blur(calc(var(--crossbar-blur) * var(--crossbar-settle)))
    saturate(calc(100% + 70% * var(--crossbar-settle)));

  /*
   * The edge, in three parts. The first inset line is the specular: a sheet of
   * glass catches a hairline of light along its top edge and that single line
   * is the biggest difference between this and a tinted div. The second is the
   * rim. The third sits it above the page.
   */
  box-shadow:
    inset 0 1.5px 0 rgba(255, 255, 255, calc(0.9 * var(--crossbar-settle))),
    inset 0 0 0 1px rgba(255, 255, 255, calc(0.3 * var(--crossbar-settle))),
    0 10px 30px -12px rgba(38, 36, 31, calc(0.3 * var(--crossbar-settle)));

  transition:
    background-color 0.5s var(--crossbar-ease),
    box-shadow 0.5s var(--crossbar-ease);
}

.beamish-glass-nav__brand {
  font-weight: 600;
  letter-spacing: 0.1em;
  text-decoration: none;
  color: inherit;
  margin-inline-end: auto;
}

.beamish-glass-nav__list {
  display: flex;
  align-items: center;
  gap: clamp(0.9rem, 2.5vw, 1.8rem);
  margin: 0;
  padding: 0;
  list-style: none;
}

.beamish-glass-nav__link {
  position: relative;
  display: inline-block;
  padding: 0.35rem 0;
  color: var(--crossbar-quiet);
  text-decoration: none;
  transition: color 0.3s var(--crossbar-ease);
}

.beamish-glass-nav__link:hover {
  color: var(--crossbar-ink);
}

/*
 * The current page is marked by aria-current, so the styling and the thing a
 * screen reader announces cannot drift apart. There is no separate class.
 */
.beamish-glass-nav__link[aria-current='page'] {
  color: var(--crossbar-ink);
}

.beamish-glass-nav__link[aria-current='page']::after {
  content: '';
  position: absolute;
  inset-inline: 0;
  bottom: 0;
  height: 1px;
  background: var(--crossbar-accent);
}

.beamish-glass-nav__link:focus-visible,
.beamish-glass-nav__brand:focus-visible {
  outline: 2px solid var(--crossbar-accent);
  outline-offset: 4px;
  border-radius: 2px;
}

/*
 * Reduced transparency is a real system setting and this is exactly the
 * component it exists for. Opaque, and the specular goes with the glass: a
 * highlight on something that is not transparent is a lie about the material.
 */
@media (prefers-reduced-transparency: reduce) {
  .beamish-glass-nav {
    background: rgb(255, 253, 247);
    -webkit-backdrop-filter: none;
    backdrop-filter: none;
    --crossbar-lens: ;
    box-shadow: 0 10px 30px -12px rgba(38, 36, 31, 0.3);
    filter: none !important;
  }
}

/*
 * Forced colours throws out every background and shadow we set, so the bar
 * would otherwise lose its edges entirely. A border is the one thing the mode
 * keeps.
 */
@media (forced-colors: active) {
  .beamish-glass-nav {
    border: 1px solid CanvasText;
    background: Canvas;
  }
}

@media (prefers-reduced-motion: reduce) {
  .beamish-glass-nav {
    transition: none;
  }
}
```

## 2. What it is

A bar of glass across the top of a page. Nearly clear over a hero, settling into
frosted once the page has scrolled under it.

That settle is the whole design. A bar legible over a photograph and a bar
legible over body copy are not the same bar, and a fixed one has to be the
second, which means it is milky over the thing you most wanted people to see.
Tying the tint to the scroll lets it be clear exactly while there is something
behind it worth looking at.

Underneath it is a nav landmark, a list and links. The current page is marked
with `aria-current="page"`, which is also what the underline keys off, so what a
screen reader announces and what you can see cannot drift apart.

## 3. Wire it in

```tsx
import { Crossbar } from '@/beamish/components/glass-nav/react'

export function Header() {
  return (
    <Crossbar
      brand="Beamish.ink"
      items={[
        { label: 'Work', href: '/work', current: true },
        { label: 'Studio', href: '/studio' },
        { label: 'Contact', href: '/contact' }
      ]}
    />
  )
}
```

Put it inside a `position: sticky; top: 0` wrapper, or give it `position:
fixed` yourself. The component does not take a position, because where a header
sits is a page layout decision and not a component one.

**Vue.**

```vue
<script setup lang="ts">
import { Crossbar } from '@/beamish/components/glass-nav/vue'

const items = [
  { label: 'Work', href: '/work', current: true },
  { label: 'Studio', href: '/studio' },
  { label: 'Contact', href: '/contact' }
]
</script>

<template>
  <Crossbar brand="Beamish.ink" :items="items" />
</template>
```

**Astro.** `<Crossbar client:load items={items} />`. It needs to be hydrated,
because the settle is JavaScript.

Anything you pass as children lands at the end of the bar, after the links,
which is where an action belongs.

## 4. Options

Every option, with its default and the range that actually looks good. Pass them
as the second argument; anything omitted takes its default.

| Option | Type | Default | Range | What it does |
| --- | --- | --- | --- | --- |
| `settleOver` | number | `120` | 0 to 600 | Pixels of scroll over which the glass goes from clear to frosted. Roughly the height of whatever is behind it at the top of the page. |
| `blur` | number | `14` | 0 to 40 | Blur at full settle. Past about 20 it stops reading as glass and starts reading as fog, and it is the setting most likely to cost a user on an old machine their frame rate. |
| `tint` | number | `0.55` | 0 to 1 | How milky it goes once settled. This is the contrast control: glass over a photograph can put 2:1 text on a page without anybody noticing, and this is what stops it. |
| `refract` | boolean | `true` | `true` · `false` | Bend the backdrop as well as blurring it. Chromium only. Everywhere else you get the blur and the edge, which is most of the effect, and nothing looks broken. |
| `refraction` | number | `18` | 0 to 60 | How far the rim bends what is behind it, in pixels. Past about 30 the bar stops looking like glass and starts looking like a heat haze. |

## 5. Cleanup and SSR

The React component removes its scroll listener and its filter on unmount, and
the Vue one does the same in `onBeforeUnmount`. Both touch `window` only inside
the mount effect, so they render on a server without complaining.

## 7. The three mistakes most likely to be made here

1. **Putting it on a flat background.** There is nothing to blur and nothing to
   bend, so it reads as a slightly dirty panel. This is the single most common
   reason glass falls flat and it is not a problem with the glass.

2. **Expecting the bend in Safari or Firefox.** It is not there, there is no
   feature query that says so, and the build will look finished in Chrome while
   shipping a plain blur everywhere else. That is by design here, but only
   because the plain blur was built to stand on its own.

3. **Leaving `tint` at zero because it looks better.** It does look better, and
   then somebody reads your nav against a white sky.

4. **Using it for a nav that has to hold a lot.** This is a bar of links. A menu
   with sections, descriptions and a search belongs in FullscreenMenu, which
   was built for exactly that and has the keyboard handling to match.

---

When you are done, confirm the effect renders and that its cleanup runs on
unmount. If something does not work, the most likely cause is at the top of the
mistakes list above, not in the shader.
