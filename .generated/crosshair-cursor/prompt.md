You are adding **CrosshairCursor** from Beamish to this project.

> A viewfinder that follows the pointer and squares up around anything you can press. Pointer · effect · MIT.
> https://beamish.ink/effects/crosshair-cursor

Beamish is not a package and there is nothing to install from npm. The source
lives in a public repo; you fetch the files, put them in this project, and wire
them in. Adapt them to whatever this project already uses. That is the point of
shipping it this way.

Assume you have not seen this library before. Everything you need is below.

## What it needs

- **npm dependencies:** None. This file has no npm dependencies at all.
- The part worth having is the lock: when the reticle passes over something you can press, the brackets leave the cursor and square up around that element. Without it this is two divs tracking a mouse. Nothing locks on to empty space
- What counts as a target is a CSS selector rather than a guess at what is clickable. Sniffing gets it wrong in both directions: it misses the div somebody wired a handler to, and it locks on to every link in a paragraph of running text
- The lock comes from a hit test at the pointer rather than from a listener for entering an element. A scripted path moves no real pointer and fires no events, so an effect that locked on only for a live cursor would record as a reticle that never finds anything
- The hit test is skipped while the pointer is still. It flushes layout, and the answer cannot have changed if nothing moved
- The brackets take a target faster than the crosshair follows the hand. A reticle that drifts lazily into place has not locked on to anything: the snap is the feedback
- Four corner brackets rather than a box, because a box round a button is a selection and a bracket at each corner is a sight. Each is the same two borders turned a quarter further round
- Like every pointer effect here it eases against its own last frame, so it is deliberately not pure in t, and the recorder drives it from the scripted path in this file
- The element keeps its own content: the reticle is drawn in a layer over the top that the pointer cannot touch. Set `cursor: none` on the element yourself if you want the real one hidden, which is a decision about the page rather than about the effect
- A DOM element with its content already in it. It animates what it finds rather than drawing anything, so there is no canvas and nothing to size, and destroy() puts the element back as it was.

Pinned to `{{PIN}}`. These URLs do not move; a future refactor gets a new tag.

## 1. Fetch these files

Fetch each URL and save it at the path given. Adjust the paths to match this
project's conventions, but keep them in the same relative arrangement. The
import between them is relative.

| Save as | Fetch from |
| --- | --- |
| `src/beamish/shared/runtime.ts` | https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/shared/runtime.ts |
| `src/beamish/effects/crosshair-cursor/core.ts` | https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/effects/crosshair-cursor/core.ts |

If you cannot fetch these URLs, say so. Do not write the file from memory. There
is a version of this prompt with the source inlined, and a guessed shader
compiles and looks wrong.

## 2. What it is

CrosshairCursor draws a pair of hairlines across a panel and four corner
brackets where they meet, following the pointer. A viewfinder rather than a
cursor.

The part that makes it worth building, rather than two divs tracking a mouse, is
what happens when it passes over something you can press: the brackets leave the
cursor and square up around that element instead. It stops being a decoration on
the pointer and becomes a statement about the page, which is the whole idea of a
reticle. Nothing locks on to empty space.

Three decisions worth knowing about.

**What counts as a target is a CSS selector, not a guess.** Anything that sniffs
for clickability gets it wrong in both directions: it misses the div somebody
wired a handler to, and it locks on to every link in a paragraph of running
text.

**The lock comes from a hit test at the pointer, not from a listener.** A
scripted path moves no real pointer and fires no events, so an effect that
locked on only for a live cursor would record as a reticle that never finds
anything. The test is skipped while the pointer is still, because it flushes
layout and the answer cannot have changed.

**The brackets take a target faster than the crosshair follows the hand.** A
reticle that drifts lazily into place has not locked on to anything. The snap is
the feedback.

## 3. Wire it in

**Plain HTML.** Put it on the area the reticle should cover. The element keeps
its own content and the reticle is drawn over the top of it.

```html
<section id="panel">
  <button type="button">Dispatch</button>
</section>

<script type="module">
  import { createCrosshairCursor } from './beamish/effects/crosshair-cursor/core.js'

  const sight = createCrosshairCursor(document.querySelector('#panel'))
  sight.start()
</script>
```

**React.**

```tsx
import { useEffect, useRef } from 'react'
import { createCrosshairCursor } from '@/beamish/effects/crosshair-cursor/core'

export function Viewfinder({ children }: { children: React.ReactNode }) {
  const host = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!host.current) return
    const sight = createCrosshairCursor(host.current, { lines: true })
    sight.start()
    return () => sight.destroy()
  }, [])

  return <div ref={host}>{children}</div>
}
```

**Vue.**

```vue
<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue'
import { createCrosshairCursor } from '@/beamish/effects/crosshair-cursor/core'
import type { EffectHandle } from '@/beamish/shared/runtime'

const host = ref<HTMLElement | null>(null)
let sight: EffectHandle | null = null

onMounted(() => {
  if (!host.value) return
  sight = createCrosshairCursor(host.value)
  sight.start()
})

onBeforeUnmount(() => sight?.destroy())
</script>

<template>
  <div ref="host"><button type="button">Dispatch</button></div>
</template>
```

**Astro.** Nothing extra is required. The core is a standard ES module and works
from a plain `<script>` in the page.

## 4. Options

Every option, with its default and the range that actually looks good. Pass them
as the second argument to the create function; anything omitted takes its default.

| Option | Type | Default | Range | What it does |
| --- | --- | --- | --- | --- |
| `colour` | color | `#c44400` | any CSS hex | The lines and the brackets. One colour: a reticle is an instrument, and an instrument is drawn in one ink. |
| `thickness` | number | `1` | 0.5 to 4 px | Thickness of a hairline. 1 is right, and anything above about 2 stops being a sight and starts being a frame. In pixels rather than relative, because a hairline is a hairline at any size. |
| `size` | number | `13` | 3 to 60 px | Half-width of the reticle when it is not locked on to anything. Small, so that locking on is a visible change: a free reticle the size of a button has nowhere to go when it finds one. |
| `corner` | number | `9` | 2 to 40 px | Length of a bracket's arms. Fixed rather than a share of the box it is framing, which is what keeps a bracket round a wide button from turning into a box round it. |
| `padding` | number | `6` | 0 to 40 px | Space left around a locked target. At 0 the brackets sit exactly on the element's edge, which reads as a border rather than as a sight trained on it. |
| `ease` | number | `0.22` | 0.02 to 1 (looks right between 0.12 and 0.35) | How fast the crosshair follows the hand, per frame. At 1 it is welded to the pointer, which is the same as not having an effect. Low enough to have weight, high enough that it is never somewhere the hand has left. |
| `snap` | number | `0.42` | 0.02 to 1 | How fast the brackets take a target, per frame. Higher than the ease on purpose. This is the one number that decides whether the effect reads as locking on or as catching up. |
| `target` | string | `a, button, [data-target]` | any value | What the brackets will lock on to, as a CSS selector. The data attribute is there so you can nominate anything else without changing the selector: put it on the card, the image, the row. |
| `lines` | boolean | `true` | `true` · `false` | Draw the long hairlines as well as the brackets. Off leaves the brackets alone, which is quieter and better over text: the lines cross everything on the page, and over a paragraph that is a strikethrough following the cursor. |

## 5. Choosing targets

`target` is a selector and the default is `a, button, [data-target]`. The data
attribute is there so you can nominate anything without rewriting the selector:
put it on the card, the image, the table row.

Be sparing. A reticle that locks on to everything is a reticle that is never
telling you anything, and over a paragraph of links it will snap between words
as the pointer crosses them.

## 6. Hiding the real cursor

This does not hide it for you. Set `cursor: none` on the element yourself if you
want it gone, because that is a decision about the page rather than about the
effect, and it is one with a cost: a visitor who loses the system cursor loses
every affordance that came with it, including the text I-beam and the resize
arrows. Over a panel of buttons it is fine. Over a form it is not.

## 7. The lines are optional, and often wrong

`lines: false` leaves the brackets on their own, which is quieter and much
better over text. The long hairlines cross everything on the page, and over a
paragraph that is a strikethrough following the cursor.

## 8. Determinism

Like every pointer effect in this library it eases against its own last frame,
so it is deliberately not pure in `t`. The recorder drives it from the scripted
cursor path in `meta.json` rather than from a mouse, which is what makes a take
reproducible.

## 9. Cleanup and SSR

`destroy()` removes the layer and puts the element's `position` back. There is
no GPU resource to release and no listener to remove, because the lock is a hit
test rather than an event.

Nothing renders on the server, and nothing needs to: the element's own content
is untouched. Call `createCrosshairCursor` from `useEffect`, `onMounted`, or a
`client:*` island.

## 10. Pausing and reduced motion

Handled in the runtime with a live `matchMedia` listener. Under reduced motion
the loop never starts, so the reticle is not drawn. That is the right answer:
this is an ornament on a pointer that already works, and a crosshair that
follows the hand is motion by definition.

## 11. The three mistakes most likely to be made here

1. **Sniffing for what is clickable.** It misses handlers on plain elements and
   it catches every link in a paragraph. A selector you chose is better than a
   guess, every time.

2. **Locking on with a listener.** It works on the page and records as a reticle
   that never finds anything, because a scripted path fires no events.

3. **Hit testing every frame.** It flushes layout for a number that cannot have
   changed if the pointer did not move.

4. **The same easing for the crosshair and the brackets.** Then locking on looks
   like catching up. The snap has to be faster than the follow.

5. **Hiding the system cursor across a whole page.** The I-beam and the resize
   arrows were doing something. Over a panel of buttons, fine; over a form, no.

## Ready-made wrappers

If you would rather not hand-write the wiring, these are the same thing as a
drop-in file. They contain no effect logic.

- https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/effects/crosshair-cursor/adapters/react.tsx
- https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/effects/crosshair-cursor/adapters/vue.ts

---

When you are done, confirm the effect renders and that its cleanup runs on
unmount. If something does not work, the most likely cause is at the top of the
mistakes list above, not in the shader.
