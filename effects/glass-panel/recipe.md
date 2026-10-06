## What it is

A slab of glass laid on a picture, bending and splitting what scrolls behind it.

Not a blur with a white border. Every part of this is something glass does:

**It bends.** The slab is a signed distance field for a rounded rectangle, and
the direction light bends is that field's gradient, which is the surface normal.
The amount is weighted towards the edge, because the middle of a slab is flat
and only the bevel has an angle to refract through. That is why the centre of
the panel stays readable while the rim distorts.

**It splits.** Glass has a different refractive index per wavelength, so the
three channels bend by slightly different amounts. This is why a real glass edge
fringes, and it is the single cheapest thing that stops a shape reading as
plastic.

**It catches the light.** The 2D gradient plus a height gives a real 3D normal,
so the highlight moves round the bevel as the light moves rather than sitting
where somebody painted it. The rim brightens where you are looking through the
most glass, which is what gives the edge its thickness.

**It sits on something.** There is a shadow under it. Without one the panel is a
window cut in the picture rather than an object resting on it.

## Why this is WebGL and not CSS

`backdrop-filter` can blur what is behind an element. It cannot bend it, and
bending is most of what glass is.

There is one CSS route that bends: an SVG displacement filter applied to the
backdrop. It works in Chromium only. Safari ignores SVG filters in
`backdrop-filter` entirely, and Firefox parses the value, passes an `@supports`
test and then renders nothing, so there is no feature query that tells the
truth. A build that looks like glass in Chrome ships a plain blur everywhere
else with no warning.

So the panel owns its own backdrop instead. That is the trade and it is worth
stating plainly: **this refracts the picture it was given, not arbitrary page
content.** If something has to sit on top of the glass, it goes in the DOM above
the canvas, which is also where it belongs for anybody using a keyboard or a
screen reader.

## The picture is your markup

```html
<div id="hero" style="position: relative; height: 70vh">
  <img src="/mountain.jpg" alt="What the picture shows" />
</div>
```

```ts
import { createGlassPanel } from './beamish/effects/glass-panel/core'

const panel = createGlassPanel(document.querySelector('#hero'))
panel.start()
```

The image is hidden from sight once uploaded and left in the document, so the
alt text is whatever you wrote and a browser that never runs the script shows
the photograph rather than an empty box.

**React.** The picture goes in as children.

```tsx
import { useEffect, useRef } from 'react'
import { createGlassPanel } from '@/beamish/effects/glass-panel/core'

export function Hero() {
  const host = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!host.current) return
    const panel = createGlassPanel(host.current)
    panel.start()
    return () => panel.destroy()
  }, [])

  return (
    <div ref={host} className="hero">
      <img src="/mountain.jpg" alt="What the picture shows" />
    </div>
  )
}
```

**Vue** and **Astro** are the same shape. The core is a standard ES module with
no framework in it.

## Putting something on it

The canvas draws the glass. Anything that sits on it is real markup above the
canvas, because WebGL cannot hold text that can be focused, selected,
translated or read aloud by anything assistive.

```html
<div id="hero" class="hero">
  <img src="/mountain.jpg" alt="Mountain ridges at dawn" />

  <div class="hero__plate">
    <p class="hero__eyebrow">Field notes</p>
    <h1>A headline sits here</h1>
    <p>And a line of supporting copy under it.</p>
    <a href="/read">Read the piece</a>
  </div>
</div>
```

Line the markup up with `panelX`, `panelY`, `panelWidth` and `panelHeight`,
which are all shares of the element, so the two stay together through a resize.

## Reading anything on glass

This is the part that will catch you out, and it is worth giving the numbers.

Dark text on clear glass over a photograph measures about **1.5:1**. WCAG wants
4.5:1 for body copy. Winding `tint` up to 0.7 gets it to **4.2:1**, which is
still short, and by then the slab is nearly opaque and there is no glass left to
look at. Tint cannot solve this, and the first attempt here, a milky wash
through the middle of the slab, measured beautifully and looked dead: washing
toward white desaturates the picture and flattens the detail, so what is left is
a panel with a smear on it.

The two systems that have solved this both do the same thing, and neither of
them paints. Windows Acrylic puts a **luminosity layer** under the tint: the
backdrop's brightness is pulled toward a level, which limits how dark or bright
it is allowed to get while the colour and the detail survive. Apple's material
shifts adaptively, moving only as far as legibility needs and letting as much
content through as possible.

So `luminosity` is a compression, not a wash. It replaces the backdrop's
luminance and adds the colour difference back at its original size, which is
what a luminosity blend means. Scaling the channels by the ratio instead is the
obvious way to write it and is wrong: it multiplies the colour cast along with
the brightness, so a dark green lifts to a neon one and the panel comes out
looking like an oil slick.

`level` is what it is pulled toward. High for dark text on the panel, low for
light text, and it is the one number that decides which way round the glass
works.

At the default 0.65 the worst tile under the plate measures **5.5:1**. 0.55
measures 4.48:1, which just misses, so the default is the first setting with
real margin rather than the most it could take. Those numbers are for this
photograph: measure yours, against the worst patch under the text at every point
in the scroll rather than the average.

## What glass is actually for

Apple's guidance on this is worth repeating because it is stricter than most
people apply it: the material belongs to **the navigation layer that floats
above content**, and not to content itself. Lists, cards, tables and media are
not supposed to be made of it.

By that reading a hero plate carrying a paragraph is the wrong use, and a nav, a
toolbar, a search field or a set of controls is the right one. The hero plate in
the demo is there because it shows the refraction at its best: a large area of
bent picture behind a few words. If you are putting a lot of text on glass, the
honest options are to raise `luminosity` until it passes, or to put the text on
the page and the glass around the controls.

## Using it as a nav

This is the arrangement it was built for, and the division of labour matters.

```html
<div id="hero" class="hero">
  <img src="/mountain.jpg" alt="Mountain ridges at dawn" />

  <nav class="hero__nav" aria-label="Main">
    <a href="/">Studio</a>
    <a href="/work">Work</a>
    <a href="/contact">Contact</a>
  </nav>
</div>
```

The canvas draws the glass. The `<nav>` is real markup sitting on top of it,
positioned over the panel with ordinary CSS. Links are links, the keyboard
works, a screen reader reads a navigation landmark, and none of that depends on
WebGL having started.

Line the nav up with `panelX`, `panelY`, `panelWidth` and `panelHeight`, which
are all shares of the element so they survive a resize.

Mind the contrast. The glass lightens what is behind it a little, but a dark
photograph under dark text is still dark text on a photograph. `tint` is the
control, and the honest check is the busiest part of the image rather than the
average.

## Scrolling

`travel` is how far the picture moves behind the glass over a full scroll of the
element through the viewport, as a share of the slack the cover fit left over.
At 1 the picture uses all of it. At 0 the picture is fixed and all the glass has
to bend is a still, which is a perfectly good panel and a waste of a lens.

The travel is capped at the slack on purpose. Pushing a picture further than its
fit allows walks off the end of the texture, and the clamp smears the last row
of pixels up the frame.

## Tuning it

`refraction` is the one that makes it glass. At 0 you have frosted glass, which
is what CSS could have done.

`bevel` is the width of the band that bends, and it is the difference between a
slab and a lens. Wide, and the whole panel distorts; narrow, and you get a sharp
optical edge round a flat middle. For a nav you want narrow, because anything
readable has to sit on the flat part.

`dispersion` past about 12 stops being glass and starts being a prism.

`frost` and `refraction` work against each other: a heavy frost smears the bend
into a wash. If the glass looks vague, take the frost down before turning the
refraction up.

`shine` low is a broad satin sheen along the whole bevel; high is a small hard
glint at the one point facing the light. Move `lightX` and `lightY` and the
glint moves, because it is lit rather than drawn.

## Performance

Outside the panel it is one texture read per pixel, so most of the frame is
nearly free.

Inside it is twelve taps on a ring, three channels each, which is thirty-six
texture reads. That is the honest cost of frosted glass whose dispersion
survives the blur: sampling the three channels once and blurring afterwards
averages the fringe away, which is why it is done per tap.

A panel covering a seventh of the frame is the intended dose. A panel covering
all of it is thirty-six reads per pixel across the whole canvas.

## Pausing

Nothing moves unless the page scrolls, which puts this outside WCAG 2.2.2 rather
than exempting it from it. `stop()` and `start()` are still on the handle.

## Reduced motion

Handled in the runtime. Under reduced motion the loop never starts and one frame
is drawn: the picture sits at its resting position with the glass on it, which
is a finished composition rather than a broken one.

## Cleanup and SSR

`destroy()` releases the WebGL context, deletes the texture, cancels the RAF,
disconnects both observers, removes every listener and puts the `<img>` back the
way it found it. Call it.

None of this runs on the server. Put the call inside `useEffect`, `onMounted`,
or a `client:*` island. Next.js App Router needs `'use client'`.

## Common mistakes

1. **Expecting it to refract the page.** It refracts the picture it was given.
   Nothing in a browser lets WebGL sample arbitrary DOM, and the libraries that
   appear to do it are rasterising your markup to an image every frame.

2. **Putting the nav text in the canvas.** It would not be selectable,
   focusable, translatable or readable by anything assistive. The canvas is
   decoration; the markup goes on top.

3. **A cross-origin image.** `texImage2D` throws a SecurityError on an image
   from another origin without CORS headers, and it throws at upload rather than
   at load, so the picture appears and the glass does not.

4. **A soft photograph.** Refraction is only legible where it has an edge to
   bend. On a gradient or a blurred background the bend is there and invisible,
   and you will conclude the effect is subtle when it is simply unlit.
