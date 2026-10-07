## What it is

ExpandingTiles is a grid of tiles where the one you press opens out to fill the
window, and the four rules that bounded its cell travel out to the edges of the
page with it. The grid you were looking at becomes the frame around what you
opened.

Three things carry it, and the first two are what every other version of this
gets wrong.

**Nothing is scaled.** The obvious way to grow a box is a transform, and a
transform takes the type with it: the title stretches as the tile grows and
settles back as it lands, which reads as cheap however well it is eased. Here
the tile is put at its final size immediately and revealed with
`clip-path: inset()`, opening from the cell outwards. Type laid out once at its
final size cannot distort, because nothing ever scales it.

**The content is carried, not left behind.** A tile jumped straight to full size
has its title wherever the full-size layout puts it, which at the moment of the
press is outside the clip: the title would blink out and reappear halfway
through. So each child is counter-translated by the distance between where it
sits at rest and where it sits open, eased to zero.

That distance is measured rather than assumed. A centred tile moves its title to
the middle of the window and a top-left one does not, and a guessed offset gets
one of the two wrong. It is measured once per tile per window size, never during
the gesture.

**The rules lead the clip.** An edge that arrives at the same moment as the
thing it bounds reads as a border. An edge that gets there first reads as the
lines pulling the tile open behind them. That is what `lead` is for, and it is
most of the difference between this looking designed and looking generated.

## Wiring

**Plain HTML.** The element's children are the tiles. Lay the grid out yourself:
the effect reads where the cells are and never positions them.

```html
<div id="tiles" class="grid">
  <a class="tile" href="/letterpress"><span>Letterpress</span></a>
  <a class="tile" href="/lithography"><span>Lithography</span></a>
  <a class="tile" href="/screen-print"><span>Screen print</span></a>
  <a class="tile" href="/risograph"><span>Risograph</span></a>
</div>

<script type="module">
  import { createExpandingTiles } from './beamish/effects/expanding-tiles/core.js'

  const grid = createExpandingTiles(document.querySelector('#tiles'))
  grid.start()
</script>
```

The tiles are your own markup and are never replaced. `destroy()` puts every
property back, including the element's own `position`.

**React.** The tiles are the children.

```tsx
import { useEffect, useRef } from 'react'
import { createExpandingTiles } from '@/beamish/effects/expanding-tiles/core'

export function Tiles({ children }: { children: React.ReactNode }) {
  const host = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!host.current) return
    const grid = createExpandingTiles(host.current, { lead: 0.22 })
    grid.start()
    return () => grid.destroy()
  }, [children])

  return <div ref={host} className="grid">{children}</div>
}
```

The dependency on `children` is deliberate: a different set of tiles is a
different grid and the cells have to be measured again.

**Vue.** The tiles come in through the default slot.

```vue
<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue'
import { createExpandingTiles } from '@/beamish/effects/expanding-tiles/core'
import type { EffectHandle } from '@/beamish/shared/runtime'

const host = ref<HTMLElement | null>(null)
let grid: EffectHandle | null = null

onMounted(() => {
  if (!host.value) return
  grid = createExpandingTiles(host.value)
  grid.start()
})

onBeforeUnmount(() => grid?.destroy())
</script>

<template>
  <div ref="host" class="grid"><slot /></div>
</template>
```

**Astro.** Nothing extra is required. The core is a standard ES module and works
from a plain `<script>` in the page.

## Links are the point

A tile with an `href` opens and then follows it, which is the whole gesture: the
page changes behind a tile that already fills the window, so there is no moment
where the reader is looking at a modal wondering how to get out of it.

The effect calls `preventDefault()` on the press and does the navigation itself
when the opening finishes. That is the only reason it touches the event at all.

A tile with no `href` stays open until it is dismissed, with Escape or another
press, so it is never a dead end. Set `follow: false` to use the gesture as a
disclosure even on tiles that do have one.

## It needs somewhere to open into

The opened tile fills the window, so whatever is inside it has to be worth a
window. Four tiles each holding a word will open into a mostly empty page, and
that reads as a bug rather than as a design.

Give the tiles content that belongs at full size, or accept that the gesture is
a transition into a real page and let the destination carry it.

## Match the rules to your grid

`ruleColour` and `rule` should be whatever your grid already draws between the
cells, because the idea is that those are the lines moving. If your grid has no
visible lines, set `rule: 0`: the tile then simply opens, which is the quieter
version and the right one in that case.

`bleed` runs the rules past the edge of the window. A rule that stops exactly at
the edge looks like it was measured to fit.

## Cleanup and SSR

`destroy()` restores every property it set on the tiles and their children,
removes the rules layer from the body, and drops both listeners. There is no GPU
resource to release and no DOM to rebuild.

All the tiles render on the server, laid out by your own CSS, which means the
grid is complete and navigable before the first frame. Nothing is hidden waiting
for JavaScript, so a page with this on it degrades to a plain grid of links.

## Accessibility

Every tile stays in the accessibility tree and in the tab order, and because
they are links they work without the effect at all. That is the right fallback:
with JavaScript off, pressing a tile goes to its page with no animation.

`aria-expanded` is maintained on each tile. The rules layer is `aria-hidden`,
because it is decoration.

Escape closes an open tile. If you set `follow: false` and the tiles hold
interactive content, give the tiles behind the open one `inert`: they are
pointer-blocked while one is open but still reachable by keyboard, and that is
yours to decide rather than something a visual effect should impose.

## Reduced motion

Handled in the runtime with a live `matchMedia` listener. Under reduced motion
the loop never starts and one frame is drawn, the one at `reducedMotionTime`,
which is 0: the grid at rest, with nothing open.

Because the tiles are ordinary links, that is not a loss of function. A press
goes straight to the page without the opening, which is exactly what someone who
asked for less motion wants.

## Common mistakes

1. **Growing the tile with a transform.** The type stretches and settles, and no
   amount of easing hides it. Put the tile at its final size and clip it.

2. **Forgetting to carry the content.** The title jumps to where the full-size
   layout puts it, which is outside the clip at the start, so it blinks out on
   press and reappears halfway through.

3. **Guessing the carry distance.** A centred tile and a top-left tile move
   their content to different places. Measure it, once per size.

4. **Rules that arrive with the edge.** They read as a border instead of as a
   movement. Let them lead.

5. **Opening into an empty page.** The gesture promises something the size of a
   window. If there is nothing there, it reads as broken.

6. **Making the tiles divs.** Then you have built a modal, you own focus
   management and the back button, and the gesture no longer means anything. Use
   links.
