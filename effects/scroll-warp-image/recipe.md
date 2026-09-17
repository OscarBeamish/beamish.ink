## What it is

One picture on a paper web that bows on every edge as it accelerates.

The same press as ScrollSlideshow, and deliberately the same deformation. The
sides lag behind the middle, the whole sheet slips against the direction of
travel, and the inks land a fraction apart while it moves. At rest it lies flat
and there is no effect at all, which is the point: a reader who has stopped
scrolling is looking at a photograph rather than at a filter.

What is different is that there is one picture and it never changes, so there is
no crossfade drawing the eye away from the edges, and the bow runs on **both**
axes rather than one. The slideshow curves the top and bottom, which is all you
see of a sheet that is being replaced. Here every edge bends, because the sheet
is the subject.

The cross-coupling is the whole trick. Each axis is displaced by how far the
*other* axis is from the centre: displacing y by a function of x is what curves
the top and bottom, and doing the same the other way round curves the sides.
Displacing each axis by its own distance would only stretch the sheet, which
reads as a zoom.

The edges deform with the picture. The bow is applied first and whatever falls
outside the source is paper, so the boundary bends rather than staying a
rectangle. There is no geometry here beyond one triangle: the shape of the sheet
is a by-product of the sampling rather than a mesh.

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

`bend` is the bow and the first thing to reach for. `slip` is the secondary: the
whole sheet sliding against the direction of travel, which you feel rather than
see. Past about 0.15 on `bend` it stops being a press and starts being a
fisheye.

`reference` is the velocity that counts as full speed. Lower makes the sheet bow
more readily; too low and an ordinary wheel click maxes it out, which loses you
the difference between a nudge and a flick.

If you cannot see it at all, the reason is almost always that the host is too
short, so there is no room to build any speed. Give it height before you touch
`bend`.

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
is drawn.

This effect needs no special case. Velocity is zero when nothing is scrolling, so
the frame that gets drawn is the undistorted photograph, which is exactly what
somebody who has asked for less motion wants to see.

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

1. **Leaving `paper` on the default when the page is not.** The bow pulls the
   sheet away from the frame and `paper` is what shows in the gap. If it does not
   match the page behind, a border appears out of nowhere whenever somebody
   scrolls, and only while they scroll, which is a maddening thing to debug.

2. **Turning `bend` up to see it better.** If you cannot see it the host is
   probably too short to build any speed. Height first.

3. **A short host element.** The travel is the element's passage through the
   viewport. Something 200px tall crosses it in one flick.

4. **A soft or empty picture.** The warp is legible only where a straight line
   bends. Architecture, type, grids and horizons all show it; a portrait against a
   blurred background hides it completely.
