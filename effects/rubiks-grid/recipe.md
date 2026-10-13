## What it is

RubiksGrid fills the frame with Rubik's cubes seen in isometric projection.
Each one turns a layer, rests, turns another, and after a few moves undoes
every one of them and comes back to solved.

It is adapted from a standalone sketch of mine, [Isometric
Rubik's](https://github.com/OscarBeamish/isometric-rubiks), which is MIT. The
look is the same. Almost none of the code is, and the reason is the whole shape
of this item.

## The original keeps its state. This one cannot

The sketch does what any cube simulation does. Pick a move, reparent the nine
cubies of that layer to a pivot object, turn the pivot, reparent them back with
their positions snapped, push the move onto a history. Every frame is built
from the one before it.

Nothing here is allowed to do that. `renderAtTime(t)` has to answer for any
moment without having seen the moments before it, so a recorder can seek and so
a loop closes exactly. So the scene graph is never mutated and no history is
kept. Three things replace it:

**Every move is derived.** Cube number seven's fourth move is a function of the
seed and those two numbers. Same answer every time it is asked, and it can be
asked out of order.

**The state is rebuilt each frame.** At time `t` a cube is some whole number of
moves in and partway through the next, so its cubies are replayed from solved.
That is a few dozen integer permutations per cube, which costs nothing next to
the matrices that have to be written anyway.

**The cubie state is integer.** Each cubie carries a position in `{-1,0,1}` and
a 3x3 rotation whose entries are only ever `-1`, `0` or `1`. This is not an
optimisation. Replaying from solved means a cube late in a scramble has had
hundreds of turns composed, and in floating point that drifts: a cube that is
supposed to be solved comes back a fraction of a degree off, which on a flat
isometric face is a visible seam. Integers cannot drift.

## The loop closes because the sequence undoes itself

Each cube scrambles for `moves` turns, then replays those same turns backwards
and in reverse order. That is the standard inverse scramble, and it returns the
cube exactly to solved.

It is the original's **solve button**, turned into the shape of the animation
rather than a control sitting on top of it.

One detail that is easy to miss: when the cubes are out of step with each
other, their offsets are **whole numbers of turns**, never fractions of one. A
fractional offset would mean the field never returns to the frame it started
on, and a recording of it would jump once per loop.

## Isometric means orthographic

The camera has no perspective in it at all. A cube at the edge of the frame has
to be exactly the same size and shape as one in the middle, or the field stops
tiling and starts being a scene with a vanishing point.

The angles are a tilt of 30 degrees and a turn of an eighth. That pair is what
makes a cube show three faces of equal width, which is the whole look. `tilt`
is adjustable, but away from 30 you have a nice axonometric view rather than an
isometric one.

## The tiling is a staircase, not a grid

This is the part that decides whether it reads as a pattern or as a shelf of
ornaments, and the first version here got it wrong.

Each row is pushed sideways by **half a cube**, so the V between two cubes in a
row is filled by the cube below it, and the rows sit **closer together than a
cube is tall** so the faces interlock. The three numbers come from projecting
the eight corners of a cube under the isometric pair and measuring:

| | as a multiple of the cube's side |
| --- | --- |
| projected width | 1.41421 |
| projected height | 1.57313 |
| spacing across | 1.38821 |
| stagger per row | 0.70111 |
| spacing down | 1.19459 |

That last one is the projected height times 0.767, and the 0.767 was found by
eye rather than derived. It is what makes the rows sit *into* each other rather
than merely near each other.

The field also **covers the frame rather than fitting inside it**. A cube
clipped by the edge is correct. A tidy margin of background around a rectangle
of cubes is the thing that makes it look like a widget instead of a surface.

## No lights at all

The whole thing is `MeshBasicMaterial`, so a face of a given colour is that
exact colour wherever it is and whichever way it points. There is no shading
anywhere.

Lambert with an ambient and a key light was tried first, because that is the
sensible thing to do, and it is wrong: the shading pulled the reds to a dusty
rose and the whites to grey, and the field stopped being a flat graphic and
became a photograph of some toys. A cube still reads as a cube because its
three visible faces are three different colours. It does not need shading.

**Leave three's colour management alone.** Turning it off skips the
sRGB-to-linear conversion on the way in but not the linear-to-sRGB conversion
on the way out, so every colour is brightened exactly once and classic red
comes out pink. The two conversions are inverses; let them be.

## Seven draw calls

The original gives every cubie its own mesh with six materials. Readable, and
at a 6x4 grid that is 648 meshes before you count the stickers.

Here the cubie bodies are one instanced mesh and the stickers are one more per
colour, so the whole field is **seven draw calls whatever its size**. The real
per-frame cost is writing the instance matrices, and that is the same either
way.

Which faces of a cubie carry a sticker is decided by **where it started**, not
where it is now. That is what keeps exactly nine of each colour however
scrambled it gets.

A cubie fills **0.88 of its cell** and the sticker covers the whole cubie face
rather than sitting inset on it. The only black in the picture is the gap
between cubies. An inset tile gives every cubie a second outline and doubles
the amount of black.

## Wiring

**Plain HTML.**

```html
<div id="hero" style="position: relative; height: 70vh"></div>

<script type="module">
  import { createRubiksGrid } from './beamish/effects/rubiks-grid/core.js'

  const field = createRubiksGrid(document.querySelector('#hero'))
  field.start()
</script>
```

**React.**

```tsx
import { useEffect, useRef } from 'react'
import { createRubiksGrid } from '@/beamish/effects/rubiks-grid/core'

export function Hero() {
  const host = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!host.current) return
    const field = createRubiksGrid(host.current, { density: 6 })
    field.start()
    return () => field.destroy()
  }, [])

  return <div ref={host} style={{ height: '70vh' }} />
}
```

**Vue.**

```vue
<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue'
import { createRubiksGrid } from '@/beamish/effects/rubiks-grid/core'
import type { EffectHandle } from '@/beamish/shared/runtime'

const host = ref<HTMLElement | null>(null)
let field: EffectHandle | null = null

onMounted(() => {
  if (!host.value) return
  field = createRubiksGrid(host.value)
  field.start()
})

onBeforeUnmount(() => field?.destroy())
</script>

<template><div ref="host" class="hero" /></template>
```

**Astro.** Nothing extra is required, but `three` has to be installed: this is
one of the few items here with a dependency.

## Tuning it

1. **`density`.** How much of the field you see. It opens the camera rather
   than resizing the cubes, so higher is more cubes at the same size. The work
   goes with the square, so 12 is four times 6.
2. **`rest`.** Most of the charm. At 0 nothing ever stops and the field reads
   as a machine. A pause lets each turn land before the next starts.
3. **`sync`.** Worth trying both. In sync the field reads as one object
   breathing; out of sync it reads as a room full of people each solving their
   own.
4. **`moves`.** Also the loop length, because the cycle is twice it. At the
   default beat, 5 moves is a six second loop.
5. **`scheme`.** Seven palettes, carried over from the sketch exactly. Each
   carries its own body colour as well as its six face colours, because the
   plastic between the stickers is part of the palette. Set it to `monochrome`
   once: with the colour gone you watch the geometry instead, and it is obvious
   how much of the effect is the turning rather than the palette.

## Two small decisions

**The middle layer is never turned.** It moves no corner, so at this size it
reads as a glitch rather than as a move.

## Cleanup and SSR

`destroy()` releases the WebGL context, disposes every geometry and material,
cancels the RAF, disconnects the observers and removes every listener. One live
context at a time is the budget, so call it.

There is nothing to render on the server. The element is empty until the script
runs, so give it a height and, if it matters, a background.

## Accessibility

Decorative, and there is nothing in the canvas for assistive technology. Under
reduced motion the loop never starts and one frame is drawn, the one at
`reducedMotionTime`. Pick a moment mid-scramble rather than 0: at 0 every cube
is solved and the field is six flat colours, which says nothing about what the
item does.

## Common mistakes

1. **Keeping a move history.** It is the obvious way to write this and it makes
   the effect unrecordable, because no frame can be produced without producing
   every frame before it.

2. **Floating-point cubie orientations.** They drift over a few hundred
   replayed turns and a solved cube comes back visibly crooked.

3. **A perspective camera.** Isometric has no vanishing point. With perspective
   the cubes at the edges splay and the field stops tiling.

4. **Fractional offsets between cubes.** The grid never returns to its starting
   frame and the loop jumps.

5. **A mesh per cubie.** It works and it is readable, and it is hundreds of
   draw calls for a result that instancing gives you in seven.

6. **Spacing the cubes on a plain grid.** They have to staircase and interlock.
   On a grid with gaps it is a shelf of ornaments.

7. **Lighting it.** There is no shading in this at all, and adding any turns
   the flat graphic into a photograph of toys.
