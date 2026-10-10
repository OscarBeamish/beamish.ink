You are adding **LightningVein** from Beamish to this project.

> A discharge branching across a dark sky, built by recursive displacement and deliberately flashing far slower than the real thing. Backdrops · effect · MIT.
> https://beamish.ink/effects/lightning-vein

Beamish is not a package and there is nothing to install from npm. The source
lives in a public repo; you fetch the files, put them in this project, and wire
them in. Adapt them to whatever this project already uses. That is the point of
shipping it this way.

Assume you have not seen this library before. Everything you need is below.

## What it needs

- **npm dependencies:** None. This file has no npm dependencies at all.
- Canvas 2D rather than a shader, because the subject is a path. A branching polyline is a handful of line segments to a canvas and a signed distance field to a fragment shader, which would be hundreds of distance tests per pixel for a shape that is mostly empty space
- The path is built by recursive midpoint displacement: one segment, push the midpoint along its normal, repeat on both halves with half the push. That gives kinks at every scale, which is what a discharge looks like. A wobble applied per step has detail at one scale only and reads as a scribble
- The push is along the segment normal rather than along x. Pushing along x gives a bolt that is only ever ragged left and right, which reads as a flag rather than as electricity
- Branches leave the channel and never rejoin it. They start below the head, because a branch off the very top has nothing above it to have come from
- Flashing is bounded on purpose and this is the one number not to raise. WCAG 2.3.1 is Level A and wants nothing flashing more than three times a second; real lightning flickers far faster. A strike here brightens at most twice and the next is a `period` away, which at the default is two brightenings in nine seconds
- Nothing is random at render time. The strike index comes from `t` by division, the bolt is built from a generator seeded on that index, and the same `t` always gives the same bolt. That is what lets the recorder seek and what closes the loop
- The glow is three strokes of increasing width rather than shadowBlur. shadowBlur on a path of a thousand points is the slowest thing a canvas can be asked to do, and the falloff is indistinguishable
- Built for a dark ground and declared as one. A discharge is light, and on a pale ground there is nothing for it to be brighter than
- A DOM element with a real size. The canvas fills its host, so a host with no height renders nothing.

Pinned to `{{PIN}}`. These URLs do not move; a future refactor gets a new tag.

## 1. Fetch these files

Fetch each URL and save it at the path given. Adjust the paths to match this
project's conventions, but keep them in the same relative arrangement. The
import between them is relative.

| Save as | Fetch from |
| --- | --- |
| `src/beamish/effects/lightning-vein/core.ts` | https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/effects/lightning-vein/core.ts |
| `src/beamish/shared/runtime.ts` | https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/shared/runtime.ts |
| `src/beamish/shared/ground.ts` | https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/shared/ground.ts |

If you cannot fetch these URLs, say so. Do not write the file from memory. There
is a version of this prompt with the source inlined, and a guessed shader
compiles and looks wrong.

## 2. What it is

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

## 3. Wire it in

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

## 4. Options

Every option, with its default and the range that actually looks good. Pass them
as the second argument to the create function; anything omitted takes its default.

| Option | Type | Default | Range | What it does |
| --- | --- | --- | --- | --- |
| `sky` | color | `auto` | any CSS hex | The sky behind it. `auto` takes it from the page, which is almost always right: the strike should sit in your page rather than bring its own rectangle of night. |
| `bolt` | color | `#eaf2ff` | any CSS hex | The channel itself. Near white with a little blue in it reads as hot; pure white reads as a drawn line. |
| `halo` | color | `#5d7fd4` | any CSS hex | The glow around the channel. Cooler and dimmer than the bolt, because air lit from the side scatters blue. |
| `period` | number | `9` | 3 to 60 s | Seconds from one strike to the next. Exactly periodic over this, and the lower bound is held well above anything WCAG 2.3.1 would count. |
| `lean` | number | `0.22` | 0 to 0.8 | How far the strike wanders off vertical overall, as a share of the width. At 0 it falls straight down and looks drawn. |
| `jitter` | number | `0.16` | 0.02 to 0.5 | The first displacement, as a share of the width. Every pass after it is half the one before, so this sets the character of the whole path. |
| `detail` | number | `6` | 3 to 8 | How many times the path is subdivided. Six is sixty-four segments. Above seven the extra kinks are smaller than a pixel and cost without showing. |
| `branches` | number | `5` | 0 to 14 | Limbs thrown off the main channel. At 0 it is a single stroke, which reads as a crack rather than a discharge. |
| `weight` | number | `2.2` | 0.6 to 6 px | Width of the main channel. The glow is drawn from this, so raising it thickens everything rather than only the core. |
| `afterglow` | number | `1.4` | 0 to 4 s | How long the channel stays faintly lit once the flash is over. This is most of what makes it read as a discharge rather than as a line that was switched off. |
| `seed` | number | `11` | 0 to 9999 | Changes every bolt in the sequence without changing anything else about them. |

## 5. Nothing is random at render time

The strike index comes from `t` by division, the bolt is built from a generator
seeded on that index, and the same `t` always gives the same bolt down to the
last branch.

That is not tidiness. An effect that calls `Math.random()` while drawing cannot
be recorded, because the recorder seeks to a time and expects the frame that
belongs there; it drifts on a dropped frame, because each frame depends on the
last; and it can never close a loop. Seeking backwards here costs exactly as
much as seeking forwards, which is nothing.

## 6. It is for a dark ground

`ground: dark` is a statement about the design rather than a warning. A
discharge is light. On a pale page there is nothing for it to be brighter than,
the halo turns to grey smudge, and the afterglow does not read at all.

`sky` defaults to `auto`, which takes the background from the page, so dropping
this into a dark page needs no configuration. If you need it on a light page,
give the section its own dark band rather than trying to tune the colours.

## 7. Tuning it

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

## 8. Cleanup and SSR

`destroy()` drops the context and the built path and removes the canvas. There
is nothing to release beyond that: no textures, no buffers, no listeners.

Nothing touches `window` or `document` at import time, so the module is safe to
import on a server. It only does anything when you call the factory.

## 9. Pausing and reduced motion

Handled by the runtime. `stop()` leaves the sky on whatever frame it was
showing, which for most of the cycle is an empty one.

Handled in the runtime. Under reduced motion the loop never starts and one
frame is drawn, at `reducedMotionTime`, which defaults to just after a strike
begins so the still is a lit bolt rather than an empty sky.

That default matters more here than on most items. Pick a time between strikes
and somebody with reduced motion gets a blank rectangle and no idea what the
item was.

## 10. The three mistakes most likely to be made here

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

## Ready-made wrappers

If you would rather not hand-write the wiring, these are the same thing as a
drop-in file. They contain no effect logic.

- https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/effects/lightning-vein/adapters/react.tsx
- https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/effects/lightning-vein/adapters/vue.ts

---

When you are done, confirm the effect renders and that its cleanup runs on
unmount. If something does not work, the most likely cause is at the top of the
mistakes list above, not in the shader.
