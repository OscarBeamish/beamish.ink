## What it is

A photograph on a sheet drawn through its own frame by the scroll.

One arc across the width. The sides hold back, the middle goes the way the page
is going, and it comes level the moment the scroll stops. Scroll down, the page
travels up past you and the middle leads it up; scroll back and the curve turns
over. At rest there is no effect at all, which is the point: a reader who has
stopped scrolling is looking at a photograph rather than at a filter.

**The shape is the whole thing**, and it is worth saying what it is, because
there are two curves you could draw here and only one of them is a sheet.

```glsl
uv.y += velocity * bend * sin(uv.x * PI);
```

Half a period of a sine: zero at both sides, one in the middle, one smooth curve
with nothing in it to catch the eye.

**The sign is not a detail.** Both of them give you the same arc and they are
different effects. This one sends the middle the way the page is going, so the
sheet reads as being drawn through its frame while the sides hold back. Subtract
instead and the middle lags: the sheet sags, and it reads as weight rather than
as travel, which looks tired rather than pulled. Try both on your own picture
before you settle, and if it looks wrong rather than weak, this is the line to
change.

The sign follows the scroll rather than being fixed, so the curve turns over
when you scroll back up. A sheet that bent the same way whichever way you went
is a sheet nothing is pulling.

The other *curve* is the distance from the centre, squared, which is what this
effect used to do. It pins the middle and throws the sides about, and reads as
the frame wobbling rather than the picture moving. It also used to bend both
axes at once. A sideways bend has no edge to run along, so all it does is muddle
the shape, and taking it out is most of what makes the arc read.

The edges deform with the picture. The sheet is a rectangle inset from the
frame, the drag carries its boundary and its contents together, and whatever
falls outside is paper, so the edges curve rather than staying square. There is
no geometry here beyond one triangle: the shape of the sheet is a by-product of
the sampling rather than a mesh.

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

`bend` is the arc and the first thing to reach for. `slip` is the secondary: the
whole sheet sliding against the direction of travel, flat across its width,
which you feel rather than see.

Keep the two of them together under `inset * (1 - 2 * inset)`, which is about
0.08 at the default margin. Past that a hard flick pushes the bent edge off the
frame and the curve ends in a straight cut, which is the one thing the inset
exists to prevent. Measured on the default plate: at rest the sheet sits 55px
in on a 540px frame, an ordinary flick draws it 16px with the middle 7px ahead
of the sides, and a flick hard enough to saturate `reference` draws it 27px with
the middle 13px ahead, which still leaves 15px of margin in front of it.

`inset` is that margin, as a share of the frame and the same on all four sides
whatever shape the picture is. Worth knowing if you are porting the earlier
version of this: the margin used to be made by widening the sampling window,
which only produced one on the axis the cover fit was not already cropping. A
3:2 photograph in a 16:9 frame came out with paper down the sides and the sheet
running edge to edge top and bottom, which is the one axis this effect needs
room on.

`reference` is the velocity that counts as full speed. Lower makes the sheet
pull more readily; too low and an ordinary wheel click maxes it out, which loses
you the difference between a nudge and a flick.

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

1. **Leaving `paper` on the default when the page is not.** The drag pulls the
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
