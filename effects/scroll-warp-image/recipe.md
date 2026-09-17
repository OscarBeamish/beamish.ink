## What it is

One picture, printed on something that is not flat, deforming as it travels up
the viewport.

The distortion is driven by scroll **position**, not scroll speed. That is the
opposite choice to ScrollSlideshow and it gives a completely different feel.
Speed-driven means nothing happens until the reader moves, and the picture is
flat the moment they stop. Position-driven means the sheet is somewhere in a
continuous deformation the whole time it is on screen, and scrolling walks it
through: barrelled and twisted one way as it comes up from the bottom, flat as it
passes the middle of the viewport, barrelled and twisted the other way as it
leaves the top.

The edges deform with everything else. This is not a rectangle with a warped
picture inside it. The warp is applied first and whatever falls outside the
source is paper, so the boundary of the sheet bends too. That is the part that
sells it, and it is why there is no geometry here beyond one triangle: the shape
of the sheet is a by-product of the sampling rather than a mesh.

One WebGL2 fragment shader. No three.js, no dependency, no render targets.

## The picture is your markup

It comes from the host element's first `<img>` child, not from an option.

```html
<figure id="plate" style="position: relative; height: 80vh; margin: 0">
  <img src="/facade.jpg" alt="What the picture shows" />
</figure>
```

```ts
import { createScrollWarpImage } from './beamish/effects/scroll-warp-image/core'

const warp = createScrollWarpImage(document.querySelector('#plate'))
warp.start()
```

The effect hides it from sight once it has uploaded it and puts it back on
`destroy()`. It stays in the document throughout, so the alt text and the loading
behaviour are whatever you wrote, and a browser that never runs the script shows
the picture. Style it so the no-JavaScript case looks deliberate: absolutely
positioned with `object-fit: cover` is usually right, because that is what the
shader does too.

**React.**

```tsx
import { useEffect, useRef } from 'react'
import { createScrollWarpImage } from '@/beamish/effects/scroll-warp-image/core'

export function Plate({ src, alt }: { src: string; alt: string }) {
  const host = useRef<HTMLElement>(null)

  useEffect(() => {
    if (!host.current) return
    const warp = createScrollWarpImage(host.current)
    warp.start()
    return () => warp.destroy()
  }, [])

  return (
    <figure ref={host} className="plate">
      <img src={src} alt={alt} />
    </figure>
  )
}
```

The image is read once, at setup. If `src` changes, destroy and remount.

**Cross-origin images.** `texImage2D` refuses to upload an image from another
origin unless it was fetched with CORS, and it throws rather than giving you a
blank texture. Serve the picture from your own origin, or set
`crossorigin="anonymous"` and make sure the host sends
`Access-Control-Allow-Origin`.

## Tuning it

`bulge` is the main shape and the first thing to reach for. `twist` is what stops
it reading as a zoom: a purely radial scale **is** a zoom, and the rotation
growing with radius is what tells you the sheet is turning rather than coming
closer.

`range` decides how much of the element's travel the warp uses. At 1 it runs the
full range, so the picture is only truly flat for an instant. Below 1 it holds
flat through the middle and then goes harder at the ends, which is usually what
you want if there is text over it.

The element's height is the timeline. A short host crosses its whole travel in
one flick and you never see the middle.

## Recording and determinism

`renderAtTime(t)` cannot be pure in `t` for anything driven by a real scrollbar.
Pass `scrollPath` and the runtime ignores the real scroll position and samples the
path instead, exactly as `pointerPath` does for the pointer effects.

```ts
createScrollWarpImage(el, {
  scrollPath: [
    { t: 0, progress: 0 },
    { t: 4, progress: 0.5 },
    { t: 8, progress: 1 }
  ],
  scrollPathDuration: 8
})
```

## Pausing

There is nothing to pause. Nothing moves unless the reader moves it, which puts
this outside WCAG 2.2.2 rather than exempting it from it. `stop()` and `start()`
are still on the handle.

## Reduced motion

Handled in the runtime. Under reduced motion the loop never starts and one frame
is drawn, at `reducedMotionTime`. The default is 0, which is the start of the
travel and therefore fully warped.

If you would rather the picture simply sat flat for those readers, the flat point
is the middle of the travel, so drive it yourself: mount with `bulge: 0`,
`twist: 0` and `squeeze: 0` when `matchMedia('(prefers-reduced-motion: reduce)')`
matches. An undistorted photograph is a perfectly good outcome and it costs you
nothing.

## Cleanup and SSR

`destroy()` releases the WebGL context, deletes the texture, restores the
original image, cancels the RAF, disconnects both observers and removes every
listener including the scroll one. Call it.

A page that mounts and unmounts demos without destroying them will hit the
browser's context limit, which is 16 contexts or 16,777,216 pixels, whichever
runs out first.

None of this runs on the server. Put the call inside `useEffect`, `onMounted`, or
a `client:*` island. Next.js App Router needs `'use client'`.

## Common mistakes

1. **Putting text over the middle of it.** The middle is the calmest part of the
   frame, which makes it tempting, and it is also the part that moves least, so
   nothing warns you during development that the corners are doing something
   violent. If there is text, bring `range` down so the sheet is flat for most of
   its travel.

2. **Reaching for `bulge` when it looks like a zoom.** More bulge makes a bigger
   zoom. `twist` is the option that makes it read as a sheet turning.

3. **A short host element.** The travel is the element's passage through the
   viewport. Something 200px tall crosses it in a flick and the effect never
   resolves.

4. **A soft or empty picture.** The warp is legible only where a straight line
   bends. Architecture, type, grids and horizons all show it; a portrait against a
   blurred background hides it completely.
