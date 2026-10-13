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
    const field = createRubiksGrid(host.current, { columns: 5 })
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

1. **`columns`.** The density and the cost at once, since rows follow from it
   and the aspect. The work goes with the square, so 10 is four times 5.
2. **`rest`.** Most of the charm. At 0 nothing ever stops and the field reads
   as a machine. A pause lets each turn land before the next starts.
3. **`sync`.** Worth trying both. In sync the field reads as one object
   breathing; out of sync it reads as a room full of people each solving their
   own.
4. **`moves`.** Also the loop length, because the cycle is twice it. At the
   default beat, 5 moves is a six second loop.
5. **`scheme`.** Set it to `monochrome` once. With the colour gone you watch
   the geometry instead, and it is obvious how much of the effect is the
   turning rather than the palette.

## Two small decisions

**The middle layer is never turned.** It moves no corner, so at this size it
reads as a glitch rather than as a move.

**three's colour management is switched off**, so a colour written in the
palette is the colour that lands. With it on, three converts every colour from
sRGB into linear light on the way in, and the sticker reds come out muddy and
the whites come out grey.

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
