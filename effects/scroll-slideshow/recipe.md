## What it is

A slideshow the page scroll runs, on a paper web that bows as it accelerates.

A web press does not feed sheets. It feeds one continuous ribbon of paper off a
reel, and at speed that ribbon bows between the rollers. The faster it runs the
more it bows. When the press stops, the paper lies flat.

That is the whole behaviour. At rest this draws an undistorted photograph and
nothing else. The distortion is a function of scroll velocity, not of time and
not of position, so a reader who has stopped scrolling is looking at the picture
rather than at an effect. Most WebGL sliders warp continuously and end up reading
as a filter laid over the content. This one only exists while it is being pulled.

Three things happen while it moves, and all three are the same press. The sides
lag behind the middle, which curves the top and bottom edges. The whole web slides
a little against the direction of travel, the way anything with mass does when it
is pulled. And the colour channels separate slightly at the edges, because a press
running colour work strikes one plate per ink and a moving web lands them a
fraction apart.

One WebGL2 fragment shader on one full-screen triangle. No three.js, no
dependency, no render targets.

## The images are your markup

The pictures come from the host element's own `<img>` children, not from an
option.

```html
<div id="reel" style="position: relative; height: 100vh">
  <img src="/one.jpg" alt="What the first picture shows" />
  <img src="/two.jpg" alt="What the second picture shows" />
  <img src="/three.jpg" alt="What the third picture shows" />
</div>
```

```ts
import { createScrollSlideshow } from './beamish/effects/scroll-slideshow/core'

const spool = createScrollSlideshow(document.querySelector('#reel'))
spool.start()
```

The effect hides them from sight once it has uploaded them and puts them back on
`destroy()`. They stay in the document throughout, so the alt text, the source
order and the loading behaviour are whatever you wrote, and a browser that never
runs the script shows the pictures. Style them so that the no-JavaScript case
looks deliberate: absolutely positioned and `object-fit: cover` is usually right,
because that is what the shader does too.

**React.** The images are children, so pass them as children.

```tsx
import { useEffect, useRef } from 'react'
import { createScrollSlideshow } from '@/beamish/effects/scroll-slideshow/core'

export function Reel() {
  const host = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!host.current) return
    const spool = createScrollSlideshow(host.current)
    spool.start()
    return () => spool.destroy()
  }, [])

  return (
    <div ref={host} className="reel">
      <img src="/one.jpg" alt="What the first picture shows" />
      <img src="/two.jpg" alt="What the second picture shows" />
    </div>
  )
}
```

The images are read once, at setup. If the list changes, destroy and remount.

**Cross-origin images.** `texImage2D` refuses to upload an image from another
origin unless it was fetched with CORS, and the failure is an exception rather
than a blank texture. Serve the pictures from your own origin, or set
`crossorigin="anonymous"` on the tag and make sure the host sends
`Access-Control-Allow-Origin`.

## How scroll drives it

Position picks the slide and velocity does the warping. Both come from the
runtime, which measures the host's travel through the viewport: 0 when its top
edge is level with the bottom of the viewport, 1 when its bottom edge is level
with the top.

So the element's height is your timeline. A `100vh` host crossfades the whole set
in two screens of scrolling, which is fast. For a set of five or six, give it
`300vh` and let it take its time.

Velocity is measured on the scroll event and bled off in the frame loop rather
than being differenced every frame. Scroll events do not fire on every frame, so
a per-frame difference reads zero on most of them and the effect stutters.

## Recording and determinism

`renderAtTime(t)` cannot be pure in `t` for an effect driven by a real scrollbar,
which is a problem for anything that wants to replay it. Pass `scrollPath` and
the runtime ignores the real scroll position and samples the path instead, exactly
as `pointerPath` does for the pointer effects.

Velocity then comes out of the path's own slope rather than from a difference
against the last frame, so it is a function of `t` like everything else.

```ts
createScrollSlideshow(el, {
  scrollPath: [
    { t: 0, progress: 0 },
    { t: 0.55, progress: 0.5 },
    { t: 2, progress: 0.5 }
  ],
  scrollPathDuration: 2
})
```

## Pausing

There is nothing to pause. Nothing moves unless the reader moves it, which is
what takes this outside WCAG 2.2.2 rather than exempting it from it. `stop()` and
`start()` are still on the handle.

## Reduced motion

Handled in the runtime. Under reduced motion the loop never starts and one frame
is drawn, which means the reader gets a still photograph with no warp at all.
That is the correct outcome here and it needs no special case.

## Cleanup and SSR

`destroy()` releases the WebGL context, deletes every texture, restores the
original images, cancels the RAF, disconnects both observers and removes every
listener including the scroll one. Call it.

A page that mounts and unmounts demos without destroying them will hit the
browser's context limit, which is 16 contexts or 16,777,216 pixels, whichever runs
out first.

None of this runs on the server. Put the call inside `useEffect`, `onMounted`, or
a `client:*` island. Next.js App Router needs `'use client'`.

## Common mistakes

1. **Turning `bend` up to see it better.** If you cannot see it, the reason is
   almost always that the host is too short, so the whole set crosses in one flick
   and there is no room to build speed. Give it height before you touch `bend`.
   Past about 0.12 it stops being a press and starts being a fisheye.

2. **Leaving `paper` on the default when the page is not.** The bow pulls the
   image away from the top and bottom of the frame and `paper` is what shows in
   the gap. If it does not match the page behind, a border appears out of nowhere
   whenever somebody scrolls.

3. **Pale images.** The warp is an edge effect, and an image that is nearly the
   same colour as the paper hides its own edges. Pictures with detail running to
   the frame show it; washed-out ones do not.

4. **Expecting it to animate on its own.** It has no idle state and no loop of its
   own. A screenshot of a page nobody is scrolling is a photograph, which is the
   entire point.
