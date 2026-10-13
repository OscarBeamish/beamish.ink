You are adding **ImageMelt** from Beamish to this project.

> One picture bleeding through another around the cursor, with a torn edge rather than a crossfade. Pointer · effect · MIT.
> https://beamish.ink/effects/image-melt

Beamish is not a package and there is nothing to install from npm. The source
lives in a public repo; you fetch the files, put them in this project, and wire
them in. Adapt them to whatever this project already uses. That is the point of
shipping it this way.

Assume you have not seen this library before. Everything you need is below.

## What it needs

- **npm dependencies:** None. This file has no npm dependencies at all.
- WebGL2. There is no WebGL1 fallback
- The version of this on every agency site is a hover: you point at a card and the first image displaces into the second over about half a second. That cannot be done here, because easing a hover toward a target is a running total and renderAtTime has to answer for any moment on its own
- So the transition is driven by where the cursor is rather than by how long it has been there. The second picture bleeds out from under it, which is a function of the pointer and the time, both of which the runtime replays exactly
- The boundary is displaced by noise before it is drawn, not blurred afterwards. A soft edge is a crossfade with extra steps; an edge that wanders by a few per cent of the frame is something coming apart
- The two pictures are pulled in opposite directions across the seam, so there is shear across it and the eye reads two separate sheets rather than one dissolve
- The channels come apart at the boundary and nowhere else. A fringe over the whole frame is a broken monitor; a fringe only where the picture is being torn is the tear doing it
- Distance from the cursor is measured with the aspect put back, so the front is a circle on screen rather than an ellipse. Squashed fronts are the commonest sign of an effect working in UV space without thinking about it
- Two octaves of noise. One is too smooth to read as torn, and the interpolation between lattice corners is cubic rather than linear: linear leaves visible straight creases running through the tear along the lattice
- The idle state still moves. The noise drifts a whole number of turns over the period, so a take with no cursor in it is a loop rather than a still
- Both <img> elements stay in the document, hidden. If the host has only one, it is used for both and the picture tears into itself, which is a reasonable thing for a single-image host to do
- Pointer effects need a scripted cursor path for recording, or the take is a still with nothing happening in it
- A DOM element with a real size. The canvas fills its host, so a host with no height renders nothing.

Pinned to `{{PIN}}`. These URLs do not move; a future refactor gets a new tag.

## 1. Fetch these files

Fetch each URL and save it at the path given. Adjust the paths to match this
project's conventions, but keep them in the same relative arrangement. The
import between them is relative.

| Save as | Fetch from |
| --- | --- |
| `src/beamish/effects/image-melt/core.ts` | https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/effects/image-melt/core.ts |
| `src/beamish/shared/runtime.ts` | https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/shared/runtime.ts |

If you cannot fetch these URLs, say so. Do not write the file from memory. There
is a version of this prompt with the source inlined, and a guessed shader
compiles and looks wrong.

## 2. What it is

ImageMelt tears one picture open to show another underneath, around the cursor.

The version of this on every agency site is a **hover**: you point at a card
and the first image displaces into the second over about half a second.

That cannot be done here, and the reason is worth stating because it shaped the
whole item. Easing a hover toward a target is a running total: frame two is
built from frame one. `renderAtTime(t)` has to answer for any moment on its own
so the recorder can seek, so nothing here may keep one.

So the transition is driven by **where the cursor is**, not by how long it has
been there. The second picture bleeds out from under it. That is a function of
the pointer and the time, both of which the runtime replays exactly, and it
keeps the part that mattered: a torn, displaced edge between two photographs
rather than a crossfade.

## 3. Wire it in

**Plain HTML.** The element needs two `<img>` children: the first is what you
start on, the second is what bleeds through. Both stay in the document, hidden,
so the alt text survives and a page whose script never runs shows the first.

```html
<div id="plate" style="position: relative; height: 70vh">
  <img src="/one.jpg" alt="A headland falling away to the sea" />
  <img src="/two.jpg" alt="A ring of stones on a green hillside" />
</div>

<script type="module">
  import { createImageMelt } from './beamish/effects/image-melt/core.js'

  const melt = createImageMelt(document.querySelector('#plate'))
  melt.start()
</script>
```

Take the images out of the flow (`position: absolute; inset: 0`). Left in it,
the canvas is pushed a full element height down the page, where it draws
perfectly and is never seen.

Give it only one `<img>` and that picture is used for both sides, so it tears
into itself. That is a perfectly good thing to do and is what a single-image
host gets rather than an error.

**React.**

```tsx
import { useEffect, useRef } from 'react'
import { createImageMelt } from '@/beamish/effects/image-melt/core'

export function Plate({ a, b }: { a: string; b: string }) {
  const host = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!host.current) return
    const melt = createImageMelt(host.current, { displace: 0.1 })
    melt.start()
    return () => melt.destroy()
  }, [a, b])

  return (
    <div ref={host} style={{ position: 'relative' }}>
      <img src={a} alt="" style={{ position: 'absolute', inset: 0 }} />
      <img src={b} alt="" style={{ position: 'absolute', inset: 0 }} />
    </div>
  )
}
```

**Vue.** Slot both pictures into the component; it hides them and uses them as
textures.

**Astro.** Nothing extra is required. The core is a standard ES module.

## 4. Options

Every option, with its default and the range that actually looks good. Pass them
as the second argument to the create function; anything omitted takes its default.

| Option | Type | Default | Range | What it does |
| --- | --- | --- | --- | --- |
| `radius` | number | `0.34` | 0.02 to 1.4 (looks right between 0.2 and 0.6) | How far the second picture reaches from the cursor, as a share of the element's height. Small is a hole you drag about; past about 1 the second picture fills the frame whenever the cursor is anywhere on it, which turns the item into a plain hover swap. |
| `feather` | number | `0.05` | 0.002 to 0.3 (looks right between 0.02 and 0.1) | How soft the boundary is. Keep it well under `displace` or the softening swallows the tear and you are back to a crossfade, which is the whole thing this is trying not to be. |
| `displace` | number | `0.1` | 0 to 0.4 (looks right between 0.05 and 0.18) | How far the noise pushes the boundary about, and how hard the two pictures shear past each other at it. The single most important number here: at 0 it is a circle with a soft edge, and it is this that makes it a tear. |
| `fringe` | number | `0.35` | 0 to 2 (looks right between 0.2 and 0.6) | How far red and blue come apart at the seam. Only at the seam, which is the point: it reads as the tear splitting the light rather than as a fault in the screen. |
| `grain` | number | `5.5` | 0.5 to 30 (looks right between 3 and 10) | How big the torn shapes are. Low gives a few long tongues of the second picture; high gives a ragged lace. Around 5 the shapes are about the size of a hand, which is what reads as something being pulled apart. |
| `drift` | number | `0.5` | 0 to 4 (looks right between 0.2 and 1) | How far the tear wanders while nothing is happening. Small: this is the breathing that stops an untouched frame being a still, not an animation in its own right. |
| `period` | number | `12` | 2 to 60 s (looks right between 8 and 24) | Seconds for one turn of that wander. The idle loop closes exactly on it, which is what lets the item be recorded without a cursor in the frame. |
| `maxDpr` | number | `2` | 1 to 3 | Device pixel ratio ceiling. Six texture samples per pixel, so this is the performance control. |
| `reducedMotionTime` | number | `0` | 0 to 60 s | The single frame shown when the user prefers reduced motion. The pointer still works under reduced motion, because responding to a deliberate action is not the kind of movement the setting is about; this only freezes the idle wander. |

## 5. Three things make the edge read as a tear

**The boundary is displaced before it is drawn, not blurred after.** A soft
edge is a crossfade with extra steps. An edge that wanders by a few per cent of
the frame is something coming apart. That is `displace`, and at 0 you have a
circle with a soft edge and none of this works.

**The two pictures shear past each other.** One is pulled toward the seam and
the other away, so there is movement *across* the boundary and the eye reads
two separate sheets rather than one picture fading into another.

**The channels come apart at the seam and nowhere else.** A fringe over the
whole frame is a broken monitor. A fringe only where the picture is being torn
is the tear splitting the light.

## 6. Two details that were wrong first

**Measure distance with the aspect put back.** Working in plain UV space makes
the front an ellipse on any element that is not square, and a squashed front is
the commonest sign of an effect that has not thought about its own coordinates.

**Interpolate the noise lattice with a cubic, not a straight line.** Linear
interpolation leaves visible straight creases running through the tear along
the lattice, which reads as a grid rather than as paper.

## 7. The idle state still moves

The noise drifts a whole number of turns over `period`, so an untouched frame
breathes instead of sitting still, and a take recorded with no cursor in it is
a clean loop rather than a frozen picture.

Keep `drift` small. It is the breathing, not an animation in its own right.

## 8. Choosing the two pictures

**They have to disagree.** A tear only reads as a tear if the two sides are
clearly different: same subject, same palette, and the seam is invisible
however hard you displace it.

Different horizon heights help most, because that is what makes the shear
across the seam visible. Different colour temperature helps nearly as much.

## 9. Tuning it

1. **`displace`.** The one that matters. Everything else is decoration on it.
2. **`feather`.** Keep it well under `displace`, or the softening swallows the
   tear and you are back to a crossfade.
3. **`grain`.** Low gives a few long tongues of the second picture; high gives
   a ragged lace. Around 5 the shapes are hand-sized, which is what reads as
   something being pulled apart.
4. **`radius`.** Past about 1 the second picture fills the frame whenever the
   cursor is anywhere on it, which turns this back into a plain hover swap.

## 10. Accessibility. Do not skip this

The alt text on each `<img>` is the accessible version of that picture and is
left exactly as written. There is nothing in the canvas for assistive
technology, by design.

The pointer still works under reduced motion, because responding to a
deliberate action is not the kind of movement that setting is about.
`reducedMotionTime` only freezes the idle wander.

## 11. Cleanup and SSR

`destroy()` releases the WebGL context and both textures, cancels the RAF,
disconnects the observers, removes every listener and puts both images'
visibility back. One live context at a time is the budget, so call it.

Both photographs render on the server as ordinary `<img>` elements, which is
the fallback: if the script never runs, the page shows them.

## 12. The three mistakes most likely to be made here

1. **Easing a hover toward a target.** It is the obvious way to write this and
   it makes the effect unrecordable, because no frame can be produced without
   producing every frame before it.

2. **Blurring the edge instead of displacing it.** A crossfade with a soft
   boundary. The displacement is the effect.

3. **Fringing the whole frame.** It reads as a broken screen rather than as a
   tear. The split belongs at the seam only.

4. **Measuring distance in raw UV.** The front comes out as an ellipse on
   anything that is not square.

5. **Two pictures that look alike.** The seam disappears and all the work goes
   to waste.

## Ready-made wrappers

If you would rather not hand-write the wiring, these are the same thing as a
drop-in file. They contain no effect logic.

- https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/effects/image-melt/adapters/react.tsx
- https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/effects/image-melt/adapters/vue.ts

---

When you are done, confirm the effect renders and that its cleanup runs on
unmount. If something does not work, the most likely cause is at the top of the
mistakes list above, not in the shader.
