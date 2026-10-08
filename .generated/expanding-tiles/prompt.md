You are adding **ExpandingTiles** from Beamish to this project.

> A grid of tiles where the pressed one opens out to fill the window, and the rules that bounded its cell travel to the edges of the page with it. Navigation · effect · MIT.
> https://beamish.ink/effects/expanding-tiles

Beamish is not a package and there is nothing to install from npm. The source
lives in a public repo; you fetch the files, put them in this project, and wire
them in. Adapt them to whatever this project already uses. That is the point of
shipping it this way.

Assume you have not seen this library before. Everything you need is below.

## What it needs

- **npm dependencies:** None. This file has no npm dependencies at all.
- Nothing is scaled. The obvious way to grow a box is a transform, and a transform takes the type with it: the title stretches as the tile grows and settles back as it lands, which reads as cheap however well it is eased. The tile is put at its final size immediately and revealed with clip-path: inset(), opening from the cell outwards, so type laid out once at its final size cannot distort
- The content is carried rather than left behind. A tile jumped straight to full size has its title wherever the full-size layout puts it, which at the moment of the press is outside the clip: the title would blink out and reappear halfway through. Each child is counter-translated by the distance between where it sits at rest and where it sits open, eased to zero. That distance is measured rather than assumed, because a centred tile moves its title to the middle of the window and a top-left one does not, and a guessed offset gets one of the two wrong
- The four rules that bounded the cell travel out to the edges of the window, and they lead the clip slightly. An edge that arrives at the same moment as the thing it bounds reads as a border; an edge that gets there first reads as a movement
- Tiles that are links open and then follow their href, which is the whole gesture: the page changes behind a tile that already fills the window. A tile with no href stays open until it is dismissed, so it is never a dead end
- Pure in t: the open tile and how far through the gesture it is are folded out of the list of presses each frame, scripted and real presses in the same list, so the recorder can seek anywhere and a live page and a take agree
- The grid is laid out by your own CSS. The effect never positions the tiles, it only opens out of them, and the author's own cell borders show through whenever nothing is open
- An opened tile is fixed to the window, which takes it out of the grid, and a grid with one fewer item re-places every item after it: the tiles behind the one you pressed shuffle up a cell and the grid's own background shows through the hole. A placeholder sized from the measured cell holds the slot, so nothing behind the open tile moves
- A DOM element with its content already in it. It animates what it finds rather than drawing anything, so there is no canvas and nothing to size, and destroy() puts the element back as it was.

Pinned to `{{PIN}}`. These URLs do not move; a future refactor gets a new tag.

## 1. Fetch these files

Fetch each URL and save it at the path given. Adjust the paths to match this
project's conventions, but keep them in the same relative arrangement. The
import between them is relative.

| Save as | Fetch from |
| --- | --- |
| `src/beamish/shared/runtime.ts` | https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/shared/runtime.ts |
| `src/beamish/effects/expanding-tiles/core.ts` | https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/effects/expanding-tiles/core.ts |

If you cannot fetch these URLs, say so. Do not write the file from memory. There
is a version of this prompt with the source inlined, and a guessed shader
compiles and looks wrong.

## 2. What it is

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

## 3. Wire it in

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

## 4. Options

Every option, with its default and the range that actually looks good. Pass them
as the second argument to the create function; anything omitted takes its default.

| Option | Type | Default | Range | What it does |
| --- | --- | --- | --- | --- |
| `duration` | number | `620` | 120 to 2000 ms (looks right between 480 and 900) | Milliseconds the opening takes. This is a navigation rather than a flourish, so it wants to be short enough that it never stands between the press and the page: past about a second it stops reading as a transition and starts reading as a wait. |
| `closeDuration` | number | `420` | 100 to 2000 ms | Milliseconds the closing takes. Shorter than the opening on purpose: opening is the thing you asked for and is worth watching, closing is getting out of the way and should not be. |
| `bleed` | number | `0.04` | 0 to 0.3 | How far the rules run past the window, as a share of its size. A rule that stops exactly at the edge looks like it was measured to fit; one that runs off reads as a line that carries on past the page. |
| `rule` | number | `1` | 0 to 6 px | Width of the travelling rules. At 0 none are drawn and the tile simply opens, which is the quieter version and the right one if your grid has no visible lines of its own. |
| `ruleColour` | color | `rgba(54, 54, 48, 0.28)` | any CSS hex | Colour of the travelling rules. Match whatever your grid already draws between the cells, because the whole idea is that these are those lines moving. |
| `lead` | number | `0.18` | 0 to 1 | How far ahead of the clip the rules run, as a share of the duration. At 0 the rules arrive with the edge they bound and read as a border; a little ahead and they read as the lines pulling the tile open behind them. |
| `follow` | boolean | `true` | `true` · `false` | Follow the opened tile's href once it has finished opening. Turn it off to use the gesture as a disclosure, where the tile opens over the grid and closes back. A tile with no href stays open whatever this says. |

## 5. Links are the point

A tile with an `href` opens and then follows it, which is the whole gesture: the
page changes behind a tile that already fills the window, so there is no moment
where the reader is looking at a modal wondering how to get out of it.

The effect calls `preventDefault()` on the press and does the navigation itself
when the opening finishes. That is the only reason it touches the event at all.

A tile with no `href` stays open until it is dismissed, with Escape or another
press, so it is never a dead end. Set `follow: false` to use the gesture as a
disclosure even on tiles that do have one.

## 6. It needs somewhere to open into

The opened tile fills the window, so whatever is inside it has to be worth a
window. Four tiles each holding a word will open into a mostly empty page, and
that reads as a bug rather than as a design.

Give the tiles content that belongs at full size, or accept that the gesture is
a transition into a real page and let the destination carry it.

## 7. Match the rules to your grid

`ruleColour` and `rule` should be whatever your grid already draws between the
cells, because the idea is that those are the lines moving. If your grid has no
visible lines, set `rule: 0`: the tile then simply opens, which is the quieter
version and the right one in that case.

`bleed` runs the rules past the edge of the window. A rule that stops exactly at
the edge looks like it was measured to fit.

## 8. Accessibility. Do not skip this

Every tile stays in the accessibility tree and in the tab order, and because
they are links they work without the effect at all. That is the right fallback:
with JavaScript off, pressing a tile goes to its page with no animation.

`aria-expanded` is maintained on each tile. The rules layer is `aria-hidden`,
because it is decoration.

Escape closes an open tile. If you set `follow: false` and the tiles hold
interactive content, give the tiles behind the open one `inert`: they are
pointer-blocked while one is open but still reachable by keyboard, and that is
yours to decide rather than something a visual effect should impose.

## 9. Cleanup and SSR

`destroy()` restores every property it set on the tiles and their children,
removes the rules layer from the body, and drops both listeners. There is no GPU
resource to release and no DOM to rebuild.

All the tiles render on the server, laid out by your own CSS, which means the
grid is complete and navigable before the first frame. Nothing is hidden waiting
for JavaScript, so a page with this on it degrades to a plain grid of links.

## 10. Pausing and reduced motion

Handled in the runtime with a live `matchMedia` listener. Under reduced motion
the loop never starts and one frame is drawn, the one at `reducedMotionTime`,
which is 0: the grid at rest, with nothing open.

Because the tiles are ordinary links, that is not a loss of function. A press
goes straight to the page without the opening, which is exactly what someone who
asked for less motion wants.

## 11. The three mistakes most likely to be made here

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

## Ready-made wrappers

If you would rather not hand-write the wiring, these are the same thing as a
drop-in file. They contain no effect logic.

- https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/effects/expanding-tiles/adapters/react.tsx
- https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/effects/expanding-tiles/adapters/vue.ts

---

When you are done, confirm the effect renders and that its cleanup runs on
unmount. If something does not work, the most likely cause is at the top of the
mistakes list above, not in the shader.
