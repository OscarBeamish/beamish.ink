## What it is

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

## Three things make the edge read as a tear

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

## Two details that were wrong first

**Measure distance with the aspect put back.** Working in plain UV space makes
the front an ellipse on any element that is not square, and a squashed front is
the commonest sign of an effect that has not thought about its own coordinates.

**Interpolate the noise lattice with a cubic, not a straight line.** Linear
interpolation leaves visible straight creases running through the tear along
the lattice, which reads as a grid rather than as paper.

## The idle state still moves

The noise drifts a whole number of turns over `period`, so an untouched frame
breathes instead of sitting still, and a take recorded with no cursor in it is
a clean loop rather than a frozen picture.

Keep `drift` small. It is the breathing, not an animation in its own right.

## Wiring

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

## Choosing the two pictures

**They have to disagree.** A tear only reads as a tear if the two sides are
clearly different: same subject, same palette, and the seam is invisible
however hard you displace it.

Different horizon heights help most, because that is what makes the shear
across the seam visible. Different colour temperature helps nearly as much.

## Tuning it

1. **`displace`.** The one that matters. Everything else is decoration on it.
2. **`feather`.** Keep it well under `displace`, or the softening swallows the
   tear and you are back to a crossfade.
3. **`grain`.** Low gives a few long tongues of the second picture; high gives
   a ragged lace. Around 5 the shapes are hand-sized, which is what reads as
   something being pulled apart.
4. **`radius`.** Past about 1 the second picture fills the frame whenever the
   cursor is anywhere on it, which turns this back into a plain hover swap.

## Cleanup and SSR

`destroy()` releases the WebGL context and both textures, cancels the RAF,
disconnects the observers, removes every listener and puts both images'
visibility back. One live context at a time is the budget, so call it.

Both photographs render on the server as ordinary `<img>` elements, which is
the fallback: if the script never runs, the page shows them.

## Accessibility

The alt text on each `<img>` is the accessible version of that picture and is
left exactly as written. There is nothing in the canvas for assistive
technology, by design.

The pointer still works under reduced motion, because responding to a
deliberate action is not the kind of movement that setting is about.
`reducedMotionTime` only freezes the idle wander.

## Common mistakes

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
