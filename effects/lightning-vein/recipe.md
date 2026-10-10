## What it is

LightningVein is a discharge branching across a dark sky. A strike arrives,
throws a few limbs, burns for a fraction of a second and leaves the channel
glowing faintly behind it. Then nothing happens for several seconds.

Three things carry it, and the first is what separates this from a jagged line
with a glow on it.

**The path is built by recursive displacement.** Start with one segment, push
its midpoint sideways, then do the same to both halves with half the push, and
again. That gives kinks at every scale: a lean across the whole strike, bends
within the lean, and a tremble on the short runs. A wobble applied per step has
detail at one scale only, which is why it reads as a scribble rather than as
electricity finding its way down.

**The push is along the segment normal, not along x.** Pushing along x gives a
bolt that is ragged left and right wherever it is pointing, which reads as a
flag. Along the normal, the kinks stay perpendicular to the run of the channel.

**The flicker is bounded, and that is a requirement rather than a preference.**
Real lightning flickers many times a second. WCAG 2.3.1 is Level A and wants
nothing flashing more than three times a second, so this does not imitate one:
a strike brightens at most twice, and the next strike is a whole `period` away.
At the default that is two brightenings in nine seconds. It still reads as
lightning, because the shape is doing the work rather than the strobing.

## Nothing is random at render time

The strike index comes from `t` by division, the bolt is built from a generator
seeded on that index, and the same `t` always gives the same bolt down to the
last branch.

That is not tidiness. An effect that calls `Math.random()` while drawing cannot
be recorded, because the recorder seeks to a time and expects the frame that
belongs there; it drifts on a dropped frame, because each frame depends on the
last; and it can never close a loop. Seeking backwards here costs exactly as
much as seeking forwards, which is nothing.

## Wiring

**Plain HTML.** The element needs a size in CSS; the canvas fills it.

```html
<div id="sky" style="width: 100%; height: 100vh"></div>

<script type="module">
  import { createLightningVein } from './beamish/effects/lightning-vein/core.js'

  const sky = createLightningVein(document.querySelector('#sky'))
  sky.start()
</script>
```

**React.**

```tsx
import { useEffect, useRef } from 'react'
import { createLightningVein } from '@/beamish/effects/lightning-vein/core'

export function Storm() {
  const host = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!host.current) return
    const sky = createLightningVein(host.current, { period: 14 })
    sky.start()
    return () => sky.destroy()
  }, [])

  return <div ref={host} style={{ height: '100vh' }} />
}
```

**Vue.** Same shape: mount on a sized element in `onMounted`, `destroy()` in
`onBeforeUnmount`.

**Astro.** Nothing extra. The core is a standard ES module with no dependencies.

## It is for a dark ground

`ground: dark` is a statement about the design rather than a warning. A
discharge is light. On a pale page there is nothing for it to be brighter than,
the halo turns to grey smudge, and the afterglow does not read at all.

`sky` defaults to `auto`, which takes the background from the page, so dropping
this into a dark page needs no configuration. If you need it on a light page,
give the section its own dark band rather than trying to tune the colours.

## Tuning it

The two that matter are `period` and `afterglow`.

`period` is how often it strikes, and the honest answer is almost always longer
than feels right while you are building it. You are watching the backdrop; your
reader is not. At three seconds it is a lightning machine, at nine it is
weather, at twenty-five it is a storm somewhere else.

`afterglow` is most of what makes it read as a discharge rather than a line
that was switched off. The channel stays faintly lit because the air is still
hot, and taking that to zero is the single fastest way to make this look cheap.

`jitter` sets the character of the path: the first push is this, and every pass
after it is half the one before, so changing it changes the whole shape rather
than only the fine detail. `detail` above seven adds kinks smaller than a pixel.

## Pausing

Handled by the runtime. `stop()` leaves the sky on whatever frame it was
showing, which for most of the cycle is an empty one.

## Reduced motion

Handled in the runtime. Under reduced motion the loop never starts and one
frame is drawn, at `reducedMotionTime`, which defaults to just after a strike
begins so the still is a lit bolt rather than an empty sky.

That default matters more here than on most items. Pick a time between strikes
and somebody with reduced motion gets a blank rectangle and no idea what the
item was.

## Cleanup and SSR

`destroy()` drops the context and the built path and removes the canvas. There
is nothing to release beyond that: no textures, no buffers, no listeners.

Nothing touches `window` or `document` at import time, so the module is safe to
import on a server. It only does anything when you call the factory.

## Common mistakes

1. **Imitating the real flicker rate.** Lightning strobes; this deliberately
   does not. Raising the flash count or dropping `period` below about three
   seconds walks into WCAG 2.3.1, which is Level A.

2. **Random at render time.** It cannot be recorded, it drifts on a dropped
   frame, and it never closes a loop. The strike index comes from `t`.

3. **Displacing along x.** A bolt that is only ragged left and right reads as a
   flag rather than as a discharge.

4. **No afterglow.** The channel going straight to black turns a discharge into
   a line that was switched off.

5. **Putting it on paper.** It is built for a dark ground and says so.

6. **Using `shadowBlur` for the glow.** On a path of a thousand points it is
   the slowest thing a canvas can be asked to do. Three strokes of increasing
   width give a falloff nobody can tell apart.
