## What it is

BlockDissolve uncovers whatever you mount it on, a block at a time.

The idea underneath it is that **every wipe is the same effect**. Cut the
element into cells, give each cell a number saying when its turn comes, and
uncover the cells whose number has come up. A left-to-right wipe, a clock
sweep, rings growing outward and a film dissolve are one mechanism fed four
different orders. Nothing else about them differs.

That is why `order` is the first option here and the only one that changes what
the thing is. Five of the six orders are a sort on one number per cell and are
a single line each. The sixth, `scatter`, is the dissolve, and it is the one
the item exists for.

## A shuffle is not an order

The obvious way to write a dissolve is to shuffle the cells and uncover them in
that order. It does not work, and the reason is the same one that makes white
noise the wrong noise for a halftone.

**A shuffle clumps.** Halfway through a shuffled wipe there is a patch of eight
cells that happened to arrive together in one corner, and a hole the same size
in the other. The eye reads both as a fault in the rendering rather than as a
dissolve. Set `spread: 1` and watch it for ten seconds: the clumps are not
subtle, and once you have seen them you cannot stop seeing them in everybody
else's.

So each cell here is the **best of `spread` random candidates**, best meaning
furthest from every cell already taken.

## Why not go all the way

The first version of this took the true furthest cell every time rather than
the furthest of a few. It is worse, and it fails in an interesting direction.

Every tie in a regular grid breaks the same way, so the sequence settles onto
the lattice, and half coverage comes out a **perfect chequerboard**. That reads
as a deliberate pattern, which is the same failure as the clump seen from the
other side: in both cases the eye finds a structure that nobody put there on
purpose.

`spread` is therefore a dial between two failures rather than a quality
setting. At 1 it clumps; at the limit it chequers; a dozen is where the holes
have gone and the lattice has not appeared.

Two details in that search are load-bearing, and both were wrong first:

**Distance is measured on a torus.** Without the wrap, cells along the edges
have fewer neighbours, so they measure as further from the taken set than they
really are. The wipe then works the border first and opens with a frame round
the outside, which nobody asked for.

**Candidates are drawn without replacement.** Drawing with replacement means a
high `spread` still only ever sees about two thirds of the pool, which quietly
caps how spread it can get and makes the top of the range do nothing.

## What it draws with

`clip-path: path()`, on the element itself, with one subpath per uncovered
block. Nothing is added to the DOM, nothing is drawn on a canvas, and the
content inside is untouched: it selects, scrolls, translates and reads the
whole time. It is simply not all visible yet.

That also makes this an item with no colour in it at all, which is why it
declares `ground: "either"` without hedging. There is nothing to tune against a
background because there is no background: it clips whatever you put it on.

**`path()` rejects percentages.** Unlike `polygon()`, which IrisReveal uses and
which follows a resize for free, `path()` takes user units only. The geometry
is rebuilt in CSS pixels whenever the box changes. This is worth knowing
because the failure is silent: a path written in percentages makes the whole
property invalid, the browser drops it, and the element comes back unclipped
looking exactly like an effect that has already finished.

Rebuilding a hundred and forty-four subpaths and setting the property measures
at 0.058ms including a forced layout, so paying it per frame is affordable. A
clip is composited, so the content under it is not repainted.

## Wiring

**Plain HTML.** Mount it on the block you want uncovered, not on each child.

```html
<section id="plate">
  <h1>Everything in here arrives together</h1>
  <p>Clipped as one thing, rather than revealed one element at a time.</p>
</section>

<script type="module">
  import { createBlockDissolve } from './beamish/effects/block-dissolve/core.js'

  const dissolve = createBlockDissolve(document.querySelector('#plate'))
  dissolve.start()
</script>
```

**React.**

```tsx
import { useEffect, useRef } from 'react'
import { createBlockDissolve } from '@/beamish/effects/block-dissolve/core'

export function Plate({ children }: { children: React.ReactNode }) {
  const host = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!host.current) return
    const dissolve = createBlockDissolve(host.current, { columns: 18 })
    dissolve.start()
    return () => dissolve.destroy()
  }, [])

  return <div ref={host}>{children}</div>
}
```

**Vue.**

```vue
<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue'
import { createBlockDissolve } from '@/beamish/effects/block-dissolve/core'
import type { EffectHandle } from '@/beamish/shared/runtime'

const host = ref<HTMLElement | null>(null)
let dissolve: EffectHandle | null = null

onMounted(() => {
  if (!host.value) return
  dissolve = createBlockDissolve(host.value)
  dissolve.start()
})

onBeforeUnmount(() => dissolve?.destroy())
</script>

<template>
  <div ref="host">
    <slot />
  </div>
</template>
```

**Astro.** Nothing extra is required. The core is a standard ES module and works
from a plain `<script>` in the page.

## Mount it on something with area

This is the mistake that wastes the most time. A clip over a flat background
cannot be seen, because uncovered and not uncovered look identical everywhere.
Every argument the item is making is about *where* the blocks are, so give it a
plate: a photograph, a gradient, a card, a coloured panel. Text on the page's
own background shows it too, but only where the letters are.

## The timing is two numbers, not one

`duration` is the whole wipe, first block to last. `overlap` is how long **one**
block takes, as a share of that.

`overlap` is what gives the front a width. At the default about forty blocks
are mid-arrival at any moment, so the edge of the wipe is made of blocks in
flight rather than being a hard boundary between arrived and not. At 0.02 they
come in one at a time and it reads as a counter.

`grow` is how much of its size a block grows through, from its centre, and not
how long it takes. At 0 the blocks arrive at full size, which is the switch,
and that one setting is most of the difference between this and a slide
transition.

## Rows follow from columns

You set `columns`; the rows come from it and the element's aspect so the cells
come out square. A fixed row count gives tall thin cells on a hero and wide
flat ones on a sidebar, and a dissolve made of letterbox slots does not read as
a dissolve.

It also means the cell count, and therefore the cost of building the order,
goes up with the square of `columns`. 16 is about 120 thousand comparisons and
invisible; 40 on a wide element is nearer five million, which is a frame you
will notice at mount and on resize.

## Cleanup and SSR

`destroy()` puts the element's `clip-path` back to whatever it was, cancels the
RAF, disconnects the observers and removes every listener. There is no WebGL
context to release: this item never takes one.

The content renders on the server exactly as written, which is the whole
fallback. If the script never runs, the page is simply not clipped.

## Accessibility

Nothing is added to the DOM and nothing is removed from it, so a screen reader
reads the content in full from the first frame, whether or not it is visible
yet. That is the right behaviour: the dissolve is decoration over content that
is already there.

Under reduced motion the loop never starts and one frame is drawn, the one at
`reducedMotionTime`, which is after the wipe has finished. The content is
simply there.

## Common mistakes

1. **Shuffling.** The clumps are the whole reason this item has a `spread`
   option. A shuffled dissolve looks like a rendering fault.

2. **Going to the other extreme.** Taking the furthest cell every time is not
   "more spread", it is a chequerboard, because every tie in a grid breaks the
   same way.

3. **Measuring distance without the wrap.** The edge cells look further from
   everything than they are, and the wipe opens with a frame round the outside.

4. **Percentages in `path()`.** They are rejected, the property goes invalid,
   and the element comes back unclipped looking like a wipe that has already
   finished.

5. **Mounting it on a flat background.** Nothing is visible, because uncovered
   and not uncovered are the same colour.

6. **Mounting it on each child instead of the block.** Six elements each
   dissolving on their own schedule is not a wipe, it is six wipes.
