You are adding **GlassSearchBar** from Beamish to this project.

> A search capsule of real glass over a picture, bending and splitting what scrolls behind it. Surfaces · effect · MIT.
> https://beamish.ink/effects/glass-search-bar

Beamish is not a package and there is nothing to install from npm. The source
lives in a public repo; you fetch the files, put them in this project, and wire
them in. Adapt them to whatever this project already uses. That is the point of
shipping it this way.

Assume you have not seen this library before. Everything you need is below.

## What it needs

- **npm dependencies:** None. This file has no npm dependencies at all.
- WebGL2. There is no WebGL1 fallback
- The picture is the host element's own <img> child. It is hidden from sight and left in the document, so the alt text is whatever you wrote and a page with no JavaScript still shows it
- This is WebGL rather than CSS because backdrop-filter can blur what is behind an element but cannot bend it, and bending is most of what glass is. The one CSS route that bends, an SVG displacement filter on the backdrop, is Chromium only and fails silently everywhere else
- The trade is that the panel owns its backdrop: it refracts the picture it was given rather than arbitrary page content. Anything that has to sit on top goes in the DOM above the canvas
- The slab is a signed distance field for a rounded rectangle, and its gradient is analytic rather than sampled, because an approximate normal shows up at once as a wobble along the straight runs
- Dispersion is three samples at three offsets along that normal, taken per tap inside the blur so the fringe survives it rather than being averaged away
- One WebGL2 context, one full-screen triangle, no buffers and no attributes
- Legibility is a luminosity compression rather than a tint: the backdrop's brightness is scaled toward a level, so the hue and the detail survive. Mixing toward white measures the same and looks dead, because it desaturates the picture and flattens what the glass is supposed to be bending
- The material belongs to the layer floating above content rather than to content itself, which is the rule Apple states for it, so what sits on the panel is a control: a search field, a toolbar, a nav. The demo is a search capsule, inset and low in the frame, which is where a thumb reaches
- Legibility is a dimming layer with light labels rather than a milky one with dark labels. A darkened photograph still looks like a photograph because the hue and the tonal relationships survive, and a whitened one does not. It is also what Apple gives its Clear variant, which has no adaptive behaviour of its own
- Measured against the brightest tile under the capsule, since white text is hardest where the backdrop is lightest: solid labels come out at 5.3:1 and the secondary ones at 4.79:1. The magnifier, the placeholder and the hint had all been set by eye and all three measured short while the field text passed
- A DOM element with a real size. The canvas fills its host, so a host with no height renders nothing.

Pinned to `{{PIN}}`. These URLs do not move; a future refactor gets a new tag.

## 1. Fetch these files

Fetch each URL and save it at the path given. Adjust the paths to match this
project's conventions, but keep them in the same relative arrangement. The
import between them is relative.

| Save as | Fetch from |
| --- | --- |
| `src/beamish/shared/runtime.ts` | https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/shared/runtime.ts |
| `src/beamish/effects/glass-search-bar/core.ts` | https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/effects/glass-search-bar/core.ts |

If you cannot fetch these URLs, say so. Do not write the file from memory. There
is a version of this prompt with the source inlined, and a guessed shader
compiles and looks wrong.

## 2. What it is

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

## 4. Options

Every option, with its default and the range that actually looks good. Pass them
as the second argument to the create function; anything omitted takes its default.

| Option | Type | Default | Range | What it does |
| --- | --- | --- | --- | --- |
| `glass` | color | `#ffffff` | any CSS hex | The tint the glass leaves and the colour its highlights take. Near white unless the glass is meant to be coloured, because it is multiplied into the picture rather than painted over it. |
| `panelX` | number | `0.5` | 0 to 1 | Centre of the panel across the element. |
| `panelY` | number | `0.82` | 0 to 1 | Centre of the panel down the element. |
| `panelWidth` | number | `0.44` | 0.05 to 1 | Width of the panel as a share of the element. |
| `panelHeight` | number | `0.115` | 0.03 to 1 | Height of the panel as a share of the element. |
| `radius` | number | `200` | 0 to 200 | Corner radius in CSS pixels, capped at half the shorter side, so a large number gives a capsule rather than an error. |
| `bevel` | number | `14` | 1 to 120 | How far in from the edge the bevel reaches. This is the width of the band that bends: the middle of a slab is flat and refracts nothing, which is why the centre stays readable and only the rim distorts. |
| `refraction` | number | `30` | 0 to 120 | How far the bevel bends what is behind it, in pixels. At 0 you have frosted glass, and this is the setting that makes it glass rather than a blur. |
| `dispersion` | number | `6` | 0 to 30 | How far the three channels separate as they bend. Glass has a different refractive index per wavelength, which is why a real edge fringes, and it is the cheapest thing that stops a shape reading as plastic. Past about 12 it stops being glass and starts being a prism. |
| `frost` | number | `2` | 0 to 40 | Frosting, as a blur radius in pixels. Twelve taps on a ring, which is not a Gaussian and does not need to be. |
| `specular` | number | `0.35` | 0 to 2 | How brightly the bevel catches the light. The highlight is lit off a real normal built from the distance field, so it moves round the rim as the light does rather than sitting where it was painted. |
| `shine` | number | `40` | 1 to 160 | How tight that catch is. Low is a broad satin sheen along the whole bevel; high is a small hard glint at the point facing the light. |
| `fresnel` | number | `0.06` | 0 to 1.5 | How much the rim brightens where you are looking through the most glass. This is what gives the edge its thickness. |
| `edge` | number | `0.25` | 0 to 1.5 | The bright hairline just inside the edge, where the bevel turns over. |
| `tint` | number | `0.22` | 0 to 1 | How much colour the glass leaves on what passes through it. This is also the contrast control if anything is going to be read on top of the panel. |
| `luminosity` | number | `0.62` | 0 to 1 | How far the backdrop's brightness is pulled toward `level` before the glass is drawn. This is what makes anything readable on the panel, and it is a compression rather than a wash: the luminance moves, the hue and the detail do not, so the picture is still a picture. Windows Acrylic calls this the luminosity layer and it is the part that guarantees contrast. At 0 the glass is clear and nothing is safe to put on it. |
| `level` | number | `0.13` | 0 to 1 | The brightness the backdrop is pulled toward. Low dims it, which suits light labels and is how a clear glass control is made legible: dimming a photograph leaves it looking like a photograph, and milking it toward white does not. High milks it, for dark labels. It is the one number that decides which way round the glass works, and the labels have to follow it. |
| `lightX` | number | `-0.5` | -2 to 2 | Where the light is, across the panel. |
| `lightY` | number | `0.7` | -2 to 2 | Where the light is, down the panel. |
| `shadow` | number | `22` | 0 to 80 | How far the shadow under the slab reaches. Without it the panel is a window cut in the picture rather than an object resting on it. |
| `travel` | number | `1` | 0 to 3 | How far the picture travels behind the glass over a full scroll, as a share of the slack the cover fit left. At 0 the picture is fixed and all the glass has to bend is a still. |

## 5. Why this is WebGL and not CSS

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

## 6. The picture is your markup

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

## 7. What goes on it

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

## 8. Reading anything on glass

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

## 9. Using it as a nav

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

## 10. Scrolling

`travel` is how far the picture moves behind the glass over a full scroll of the
element through the viewport, as a share of the slack the cover fit left over.
At 1 the picture uses all of it. At 0 the picture is fixed and all the glass has
to bend is a still, which is a perfectly good panel and a waste of a lens.

The travel is capped at the slack on purpose. Pushing a picture further than its
fit allows walks off the end of the texture, and the clamp smears the last row
of pixels up the frame.

## 11. Tuning it

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

## 12. Performance

Outside the panel it is one texture read per pixel, so most of the frame is
nearly free.

Inside it is twelve taps on a ring, three channels each, which is thirty-six
texture reads. That is the honest cost of frosted glass whose dispersion
survives the blur: sampling the three channels once and blurring afterwards
averages the fringe away, which is why it is done per tap.

A panel covering a seventh of the frame is the intended dose. A panel covering
all of it is thirty-six reads per pixel across the whole canvas.

## 13. Cleanup and SSR

`destroy()` releases the WebGL context, deletes the texture, cancels the RAF,
disconnects both observers, removes every listener and puts the `<img>` back the
way it found it. Call it.

None of this runs on the server. Put the call inside `useEffect`, `onMounted`,
or a `client:*` island. Next.js App Router needs `'use client'`.

## 14. Pausing and reduced motion

Nothing moves unless the page scrolls, which puts this outside WCAG 2.2.2 rather
than exempting it from it. `stop()` and `start()` are still on the handle.

Handled in the runtime. Under reduced motion the loop never starts and one frame
is drawn: the picture sits at its resting position with the glass on it, which
is a finished composition rather than a broken one.

## 15. The three mistakes most likely to be made here

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

## Ready-made wrappers

If you would rather not hand-write the wiring, these are the same thing as a
drop-in file. They contain no effect logic.

- https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/effects/glass-search-bar/adapters/react.tsx
- https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/effects/glass-search-bar/adapters/vue.ts

---

When you are done, confirm the effect renders and that its cleanup runs on
unmount. If something does not work, the most likely cause is at the top of the
mistakes list above, not in the shader.
