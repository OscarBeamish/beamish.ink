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
import { createGlassSearchBar } from './beamish/effects/glass-search-bar/core'

const panel = createGlassSearchBar(document.querySelector('#hero'))
panel.start()
```

The image is hidden from sight once uploaded and left in the document, so the
alt text is whatever you wrote and a browser that never runs the script shows
the photograph rather than an empty box.

**React.** The picture goes in as children.

```tsx
import { useEffect, useRef } from 'react'
import { createGlassSearchBar } from '@/beamish/effects/glass-search-bar/core'

export function Hero() {
  const host = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!host.current) return
    const panel = createGlassSearchBar(host.current)
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

## What goes on it

Apple's rule for this material is stricter than most people apply it, and it
decides the whole design: the material belongs to **the layer that floats above
content**, not to content itself. Lists, cards, tables and media are not
supposed to be made of glass.

So what sits on the panel is a control. A search field, a toolbar, a set of
actions, a nav. Not a paragraph.

The default arrangement is a search capsule, which is the shape Apple reaches
for first: inset from the edges, low in the frame on a phone because that is
where a thumb reaches, and in the top trailing corner on anything larger.

```html
<div id="hero" class="hero">
  <img src="/mountain.jpg" alt="Mountain ridges at dawn" />

  <form class="hero__capsule" role="search" action="/search">
    <label class="visually-hidden" for="q">Search the library</label>
    <svg aria-hidden="true" focusable="false">...</svg>
    <input id="q" type="search" name="q" placeholder="Search the library" />
    <kbd>/</kbd>
  </form>
</div>
```

The canvas draws the glass. The form is real markup above it, so it can be
focused, typed into, submitted, read aloud and translated, and none of that
depends on WebGL having started.

Two details that are easy to get wrong. The label is the accessible name and the
placeholder is not: a placeholder goes the moment anybody types and is not
announced by everything, so the field keeps a real label even when it is hidden.
And the focus ring belongs on the capsule rather than on the input, because the
input has no edge of its own. The glass is its edge.

Line the control up with `panelX`, `panelY`, `panelWidth` and `panelHeight`,
which are all shares of the element, so the two stay together through a resize.

## Reading anything on glass

This is the part that will catch you out, and it is what Nielsen Norman went
after Liquid Glass for: text over a photograph, where the contrast is whatever
the picture happens to be at that moment.

**Dim the backdrop and use light labels.** That is the whole answer and it took
two wrong ones to get there.

The first attempt milked the glass toward white so dark labels would read. It
measured beautifully and looked dead: washing toward white desaturates the
picture and flattens the detail, so what is left is a panel with a smear on it
rather than glass. The second attempt kept the milk and only moved the numbers
around, which was the same mistake with better arithmetic.

Dimming does not have that problem. A photograph that has been darkened still
looks like a photograph, because the hue and the relationships between tones
survive; one that has been whitened does not. It is also what Apple does for a
clear glass control: the Clear variant has no adaptive behaviour of its own, so
it is given a dimming layer to make its symbols and labels legible.

`level` is the brightness the backdrop is pulled toward, and it is the one
number that decides which way round the panel works. Low dims it, for light
labels, which is the default. High milks it, for dark ones. The labels have to
follow it: light text on a milked panel is as unreadable as dark text on a
dimmed one.

`luminosity` is how far it is pulled. It is a compression, not a wash: it
replaces the backdrop's luminance and adds the colour difference back at its
original size, which is what a luminosity blend means. Writing it as a scale by
the ratio is the obvious way and is wrong, because it multiplies the colour cast
along with the brightness and a dark green lifts to a neon one.

### The numbers

Measured against the brightest 12px tile under the capsule, at four points in
the scroll, because white text is hardest where the backdrop is lightest:

| luminosity / level | solid white | label at 88% |
| --- | --- | --- |
| 0.55 / 0.15 | 4.58 | 4.05, fails |
| **0.62 / 0.13** | **5.30** | **4.79** |
| 0.70 / 0.12 | 6.15 | 5.55 |

The default is 0.62 and 0.13, which is the first setting where every label on
the panel passes rather than only the one that is typed into. That distinction
matters: the magnifier, the placeholder and the shortcut hint were all set by
eye at around 75 percent opacity, and all three measured short of 4.5:1 while
the field's own text passed. They are at 88 now.

For reference, with no dimming at all the same text measures about **1.5:1**.

Those numbers are for this photograph. Measure yours, against the worst patch
under the labels at every point in the scroll rather than the average.

## Using it as a nav

The other arrangement, and the same division of labour.

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

Make the panel wide and short with a large `radius`, keep `bevel` narrow so the
flat middle carries the links, and put it where a nav goes. Links are links, the
keyboard works, and a screen reader reads a navigation landmark.

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
