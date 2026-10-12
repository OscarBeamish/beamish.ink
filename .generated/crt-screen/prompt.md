You are adding **CrtScreen** from Beamish to this project.

> A picture shown on a tube rather than on a panel: the glass bows, the phosphors sit in columns and the beam overshoots. Surfaces · effect · MIT.
> https://beamish.ink/effects/crt-screen

Beamish is not a package and there is nothing to install from npm. The source
lives in a public repo; you fetch the files, put them in this project, and wire
them in. Adapt them to whatever this project already uses. That is the point of
shipping it this way.

Assume you have not seen this library before. Everything you need is below.

## What it needs

- **npm dependencies:** None. This file has no npm dependencies at all.
- WebGL2. There is no WebGL1 fallback
- Scanlines drawn over a flat image read as an image with stripes on it. The thing that makes a picture read as a cathode ray tube is a short list that has to be there together, and most of it is not the scanlines
- The glass is curved. The picture bows outward, straight lines near the edge bend and the corners pull in. Without this nothing else helps: a rectangle with stripes is a rectangle. The bezel is whatever falls outside the bent picture, which is why it is in the shader rather than in CSS
- The phosphors are in columns. A tube has an aperture grille, red green and blue side by side, which is why a white area in a photograph of a CRT is never white up close. The scanlines are the rows and the grille is the columns, and it is the columns that stop the rows reading as a venetian blind
- The grille is measured in device pixels rather than CSS ones. It is a physical thing on the glass, so it should get finer on a denser display rather than staying the same size in points
- The grille is lifted towards white rather than multiplied straight, and by a long way. Multiplied in at full strength it sends two thirds of every cell to black, and at three device pixels a cell is below the size at which a stripe can be drawn cleanly, so on a page scaling the canvas what reaches the eye is coloured noise rather than a grille. `mask` is that lift, and at 1 you get the macro view
- The beam overshoots, so a bright area bleeds into its neighbours. Three taps across the grille, not a blur: the grille is about to throw away most of the horizontal detail anyway, so a wider and more expensive kernel buys nothing visible
- The channels do not land on each other. Red and blue are pulled either side of green along the radius, by an amount that grows towards the corners, because that is where the deflection coils are working hardest
- The scanlines are counted down the glass rather than measured in the picture, so they stay put when the image changes. Fixed to the screen, which is what they are
- Only the rolling bar moves. Animating the scanlines or the grille turns the whole thing into a pattern sliding over a photograph, which is the usual mistake
- The <img> stays in the document, hidden. Its alt text is the accessible version of the picture and a page whose script never runs still shows the photograph
- A DOM element with a real size. The canvas fills its host, so a host with no height renders nothing.

Pinned to `{{PIN}}`. These URLs do not move; a future refactor gets a new tag.

## 1. Fetch these files

Fetch each URL and save it at the path given. Adjust the paths to match this
project's conventions, but keep them in the same relative arrangement. The
import between them is relative.

| Save as | Fetch from |
| --- | --- |
| `src/beamish/effects/crt-screen/core.ts` | https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/effects/crt-screen/core.ts |
| `src/beamish/shared/runtime.ts` | https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/shared/runtime.ts |

If you cannot fetch these URLs, say so. Do not write the file from memory. There
is a version of this prompt with the source inlined, and a guessed shader
compiles and looks wrong.

## 2. What it is

CrtScreen puts a picture on a tube instead of on a panel.

Almost every version of this is scanlines: a dark stripe every other row, drawn
over the image, done. It never works, and the reason is easy to state. A flat
rectangle with horizontal stripes on it is a flat rectangle with horizontal
stripes on it. Nothing about stripes says cathode ray tube.

What says cathode ray tube is a short list of things that have to be there
together, and most of them are not the scanlines.

**The glass is curved.** The picture bows outward, straight lines near the edges
bend, and the corners pull in. This is the one that does the work. Set `curve`
to 0 and every other setting here stops helping; set it to 0.12 and the item is
most of the way there before the grille has drawn a single stripe.

**The phosphors are in columns.** A tube has an aperture grille: red, green and
blue stripes side by side, which is why a white area in a photograph of a CRT is
never white when you get close to it. The scanlines are the rows. The grille is
the columns. It is the columns that stop the rows reading as a venetian blind,
and you can check that by setting `grille: 0` and watching the thing collapse
back into an image with stripes on it.

**The beam overshoots.** A bright area bleeds into what is next to it, because
the electron beam does not stop where the signal does.

**The channels do not land on each other.** Convergence is never perfect, so red
and blue sit a fraction either side of green, and the error grows towards the
corners because that is where the deflection coils are working hardest.

**The tube is dim at the edges, and a bar rolls down it**, from the signal and
the mains being very slightly out of step.

The bezel is drawn in the shader rather than in CSS, because the bezel is
defined as whatever falls outside the bent picture. A CSS frame cannot know
where that is.

## 3. Wire it in

**Plain HTML.** The element must contain an `<img>`. It stays in the document,
hidden once the texture is uploaded, so a browser that never runs the script
shows the photograph and a screen reader still reads the alt text.

```html
<div id="tube" style="position: relative; height: 70vh">
  <img src="/plate.jpg" alt="A street at night, lit signs against a black sky" />
</div>

<script type="module">
  import { createCrtScreen } from './beamish/effects/crt-screen/core.js'

  const tube = createCrtScreen(document.querySelector('#tube'))
  tube.start()
</script>
```

Take the image out of the flow (`position: absolute; inset: 0`). Left in it, the
canvas the effect appends is pushed a full element height down the page, where
it draws perfectly and is never seen. That is worth saying because it looks like
the effect has failed rather than like a layout problem.

**React.**

```tsx
import { useEffect, useRef } from 'react'
import { createCrtScreen } from '@/beamish/effects/crt-screen/core'

export function Tube({ src, alt }: { src: string; alt: string }) {
  const host = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!host.current) return
    const tube = createCrtScreen(host.current, { curve: 0.12 })
    tube.start()
    return () => tube.destroy()
  }, [src])

  return (
    <div ref={host} style={{ position: 'relative' }}>
      <img src={src} alt={alt} style={{ position: 'absolute', inset: 0 }} />
    </div>
  )
}
```

**Vue.**

```vue
<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue'
import { createCrtScreen } from '@/beamish/effects/crt-screen/core'
import type { EffectHandle } from '@/beamish/shared/runtime'

const host = ref<HTMLElement | null>(null)
let tube: EffectHandle | null = null

onMounted(() => {
  if (!host.value) return
  tube = createCrtScreen(host.value)
  tube.start()
})

onBeforeUnmount(() => tube?.destroy())
</script>

<template>
  <div ref="host" class="tube">
    <img src="/plate.jpg" alt="A street at night, lit signs against a black sky" />
  </div>
</template>
```

**Astro.** Nothing extra is required. The core is a standard ES module and works
from a plain `<script>` in the page.

## 4. Options

Every option, with its default and the range that actually looks good. Pass them
as the second argument to the create function; anything omitted takes its default.

| Option | Type | Default | Range | What it does |
| --- | --- | --- | --- | --- |
| `curve` | number | `0.12` | 0 to 0.5 (looks right between 0.06 and 0.2) | How much the glass bows the picture. The one that does the most work: at 0 you have a flat image with stripes on it and nothing below will rescue it, and by 0.35 it is a fish-eye rather than a tube. 0.12 is about a late consumer set, where the curve is obvious at the corners and unremarkable in the middle. |
| `grille` | number | `3` | 0 to 12 px (looks right between 2 and 5) | Width of one phosphor cell in device pixels, so three subpixels fit across it. 0 turns the grille off, which is worth doing once to see how much of the effect is the columns rather than the rows. This is the pitch; `mask` is how strongly it shows. Above about 6 the stripes stop being a texture and become the subject. |
| `mask` | number | `0.55` | 0 to 1 (looks right between 0.4 and 0.7) | How strongly the grille shows, from a tint over the picture to the macro view. At 1 the stripes are drawn at full strength, which sends two thirds of every cell to black; at three device pixels a cell is below the size at which a stripe can be drawn cleanly, so on a page that is scaling the canvas what reaches the eye is not a grille but coloured noise. 0.55 is what a tube looks like from the sofa. Set it to 1 once and look at it an inch from the screen. |
| `scanline` | number | `0.38` | 0 to 1 (looks right between 0.2 and 0.5) | How dark the gaps between rows go. The number everybody reaches for first and the one that matters least: past about 0.6 the picture is half black and you are looking at a blind. |
| `scanCount` | number | `200` | 60 to 1200 (looks right between 140 and 320) | How many lines down the glass. This is a count of lines on a screen, not a frequency in the picture, so it stays put when the image changes. Broadcast was 576 visible lines in Europe and 480 in America; 200 is well under either on purpose, because at a real line count on a dense display the rows fall below a pixel and alias into a moire. |
| `bloom` | number | `0.32` | 0 to 2 (looks right between 0.2 and 0.6) | How far a bright area bleeds into its neighbours. Only the parts of the picture above a threshold spill, which is why this reads as a beam overshooting rather than as the whole image going soft. |
| `converge` | number | `1.1` | 0 to 5 (looks right between 0.6 and 1.8) | How far red and blue miss each other at the corners, in roughly thousandths of the frame. Small numbers only. Convergence error is something you notice on white type at the edge of the screen and nowhere else, and a set this badly out would have gone back to the shop. |
| `vignette` | number | `0.5` | 0 to 1 (looks right between 0.3 and 0.7) | How dim the edges of the tube go. It is doing two jobs: a tube really is dimmer at the edges, and it also hides the corners where the curvature is working hardest and the picture is most stretched. |
| `roll` | number | `0.1` | 0 to 1 (looks right between 0.05 and 0.25) | How strongly the bar rolling down the glass shows. 0 removes it and makes the whole item a still, which is the right setting behind text. Keep it low: this is a set very slightly out of step with the mains, not a set that is broken. |
| `brightness` | number | `1.05` | 0.2 to 3 (looks right between 0.9 and 1.4) | Applied before the grille and the scanlines take their share, which is why it sits above 1. The rows and the columns together remove roughly a quarter of the light at the default mask, so a picture passed through at 1.0 comes out a little darker than it went in. Raise it with `mask`, not on its own. |
| `contrast` | number | `0.12` | -0.5 to 1.5 (looks right between 0 and 0.4) | Pushed away from the midtone before the grille, for the same reason as brightness. A tube crushes its shadows, and a little of this is what separates the lit parts of the picture from the glow the grille leaves in the black. |
| `tint` | color | `#ffeedd` | any CSS hex | The cast of the tube, multiplied over the picture. Warm on purpose: a phosphor is not neutral, and a tube that renders white as white reads as a flat panel doing an impression. Cool it towards #ddeeff for a monitor rather than a television. |
| `bezel` | color | `#07070a` | any CSS hex | Whatever falls outside the curved glass. Near-black rather than black, so it sits against the page instead of punching a hole in it. If it reads as a visible frame, the curve is too high rather than this being too light. |
| `period` | number | `6` | 1 to 30 s (looks right between 4 and 12) | Seconds for one pass of the bar down the glass. The loop closes exactly on it, so the last frame is the first frame. Longer is calmer and almost always better: at 2 it is a strobe. |
| `maxDpr` | number | `2` | 1 to 3 | Device pixel ratio ceiling. The grille is measured in device pixels, so this changes how fine the stripes are as well as what it costs to draw them. |
| `reducedMotionTime` | number | `1.5` | 0 to 30 s | The single frame shown when the user prefers reduced motion. Anything works: the bar is the only thing that moves, and the tube is the point. |

## 5. What moves

The bar, once per `period`, and nothing else.

The scanlines and the grille are fixed to the glass and do not move, because
they are the screen rather than the picture. Animate them and the whole thing
reads as a pattern sliding over a photograph, which is the second most common
way to get this wrong.

`renderAtTime(t)` is pure in `t` and the loop closes exactly on the period, so
the last frame is the first frame.

## 6. Tuning it, in order

Set them in this order, because each one changes what the next one looks like.

1. **`curve`.** Everything rests on it. 0.12 is about a late consumer set:
   obvious at the corners, unremarkable in the middle. By 0.35 it is a fish-eye.
2. **`grille` and `mask`.** `grille` is the pitch, 3 device pixels per cell so
   three subpixels fit across it. `mask` is how hard the stripes are drawn, and
   it is the one that decides whether this reads as a tube or as a mesh over a
   photograph. See below.
3. **`brightness` and `contrast`.** The rows and columns together take roughly a
   quarter of the light, which is why brightness sits above 1 rather than at it.
4. **`scanline`.** The number everybody reaches for first and the one that
   matters least. Past 0.6 the picture is half black.
5. **`converge`, `bloom`, `vignette`, `roll`.** Small numbers. Each of these is
   something you notice once and then stop seeing, which is the correct amount.

## 7. The grille is in device pixels

Not CSS pixels. A grille is a physical thing on the front of a tube, so on a
denser display it should get finer rather than staying the same size in points.
That also means `maxDpr` changes how the item looks and not only what it costs.

## 8. The mask, and why it is not at full strength

The stripes are lifted towards white before they are multiplied in, and by a
long way: `mask` at the default of 0.55 draws them as a tint over the picture
rather than as stripes.

That is not a softening for taste. Multiply a pure red-green-blue mask straight
over an image and two thirds of every cell goes to black. Worse, at three device
pixels a cell is below the size at which a stripe can be drawn cleanly, so once
the browser is scaling the canvas at all, what reaches the eye is not a grille
but coloured noise, and the picture goes muddy underneath it.

A real tube does look like the full-strength version. From an inch away. `mask:
1` is that view and it is worth setting once, nose against the screen, because
after that the default stops looking like a compromise and starts looking like
the right distance.

## 9. Choosing a picture

Something with bright saturated areas and real black in it. Signage at night,
a title card, a lit face against a dark room.

A flat daylight photograph hides the entire effect. The vignette has nothing to
darken, the bloom has nothing to spill, the convergence error has no hard white
edge to show on, and the grille's lift in the shadows has no shadows to lift.
You will have built all of it and be able to see none of it.

Crop to 4:3 if you can. It is the shape of the thing.

## 10. Behind text

Turn `roll` to 0 and drop `scanline` to about 0.15. The bar passing under a
paragraph is a moving luminance change behind reading text, which is the one
thing in this item worth being careful about, and with `roll: 0` the whole
effect becomes a still: no loop runs and nothing moves at all.

## 11. Accessibility. Do not skip this

The alt text on the `<img>` is the accessible version of the picture and it is
left exactly as written. Write it as you would for the photograph, because that
is what the reader is being told about. There is nothing in the canvas for
assistive technology, by design.

Under reduced motion the loop never starts and one frame is drawn, the one at
`reducedMotionTime`. Which frame hardly matters: the bar is the only thing that
moves, and the tube is the point.

## 12. Cleanup and SSR

`destroy()` releases the WebGL context and the texture, cancels the RAF,
disconnects the observers, removes every listener, and puts the image's
visibility back. One live context at a time is the budget, so call it.

The photograph renders on the server as an ordinary `<img>`, which is the whole
fallback: if the script never runs, the page shows the picture.

## 13. The three mistakes most likely to be made here

1. **Scanlines and nothing else.** The most common version of this effect and
   the one that never convinces. Without the curve it is an image with stripes
   on it.

2. **Animating the scanlines.** They are part of the screen, not part of the
   picture. Sliding them turns the item into a pattern moving over a photograph.

3. **Drawing the grille at full strength.** Two thirds of every cell goes black,
   and at a three-pixel pitch on a canvas the browser is scaling, the stripes
   alias into coloured noise. `mask` is the lift that fixes both.

4. **A scanline count that matches the display.** Broadcast was 576 visible
   lines in Europe and 480 in America, and at either of those on a dense screen
   the rows fall below a pixel and alias into a moire. 200 is low on purpose.

5. **A flat daylight photograph.** Every part of the effect needs bright things
   next to dark things, and there are none.

6. **Leaving the image in the flow.** The canvas lands an element height below
   it, draws correctly, and is never seen.

## Ready-made wrappers

If you would rather not hand-write the wiring, these are the same thing as a
drop-in file. They contain no effect logic.

- https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/effects/crt-screen/adapters/react.tsx
- https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/effects/crt-screen/adapters/vue.ts

---

Concept credit: The parameter set for a CRT filter, from the Shader Effects library. Curvature is not in theirs and is added here because it is the one that matters most, by Shader Effects Inc., https://github.com/shader-effects-inc/shaders.
The implementation here is written from scratch.

---

When you are done, confirm the effect renders and that its cleanup runs on
unmount. If something does not work, the most likely cause is at the top of the
mistakes list above, not in the shader.
