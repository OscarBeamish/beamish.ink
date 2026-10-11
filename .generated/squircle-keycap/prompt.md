You are adding **SquircleKeycap** from Beamish to this project.

> A key drawn as a superellipse and extruded, which travels when you press it. Surfaces · effect · MIT.
> https://beamish.ink/effects/squircle-keycap

Beamish is not a package and there is nothing to install from npm. The source
lives in a public repo; you fetch the files, put them in this project, and wire
them in. Adapt them to whatever this project already uses. That is the point of
shipping it this way.

Assume you have not seen this library before. Everything you need is below.

## What it needs

- **npm dependencies:** None. This file has no npm dependencies at all.
- The shape is the point. A border-radius is a rectangle with circular arcs stuck on the corners, and the join between the straight edge and the arc is continuous in position and direction but not in curvature: it jumps from zero to one over the radius, instantly. A superellipse has no join at all, because it is one equation the whole way round
- Walked as a path rather than approximated, so the exponent is a real control: 2 is an ellipse, 4 is the shape everybody means, and by 12 it is a rectangle with a suggestion of a corner. No value of border-radius lands on any of them
- The exponent is applied to the absolute value of the cosine and the sign put back, because a fractional power of a negative number is not a number and the left half of the shape would simply not be drawn
- The travel is a closed form of the time since the press, so renderAtTime is pure in t. A key is state between frames by nature, which is the one thing this library will not have: the resolution is to keep the list of presses rather than the position and work the displacement out from the clock. Seeking backwards unpresses the key, which a spring integrated frame by frame can never do
- An attack and a decay, not a spring. A keycap does not oscillate: it goes down against a stop, fast and ending abruptly, and comes back on a rubber dome, slower and settling without overshoot
- The side is drawn as its own extrusion rather than as a drop shadow, which is the difference between a key and a sticker. It is also what makes the travel legible: the side gets shorter as the key goes down, and that is the part anyone actually reads
- The top is dished rather than domed. A keycap is concave so a fingertip sits in it, and what reports that is a soft dark edge at the top of the face, not a highlight in the middle
- A press anywhere on the element counts rather than only inside the drawn shape. A click two pixels outside the edge is a click the reader believes they made
- 2D rather than WebGL. A key is something you want several of on a page, and the budget is one WebGL context
- It is a drawing of a control, not a control. There is no role, no focus and no keyboard handling, because a canvas cannot carry them. Put it behind a real button if it is going to do something
- A DOM element with a real size. The canvas fills its host, so a host with no height renders nothing.

Pinned to `{{PIN}}`. These URLs do not move; a future refactor gets a new tag.

## 1. Fetch these files

Fetch each URL and save it at the path given. Adjust the paths to match this
project's conventions, but keep them in the same relative arrangement. The
import between them is relative.

| Save as | Fetch from |
| --- | --- |
| `src/beamish/effects/squircle-keycap/core.ts` | https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/effects/squircle-keycap/core.ts |
| `src/beamish/shared/runtime.ts` | https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/shared/runtime.ts |

If you cannot fetch these URLs, say so. Do not write the file from memory. There
is a version of this prompt with the source inlined, and a guessed shader
compiles and looks wrong.

## 2. What it is

SquircleKeycap is a key you can press: a superellipse, extruded, that travels
when you push it and comes back on a rubber dome.

## 3. Wire it in

**Plain HTML.** The element needs a size. A press anywhere on it presses the
key.

```html
<div id="key" style="width: 160px; height: 160px"></div>

<script type="module">
  import { createSquircleKeycap } from './beamish/effects/squircle-keycap/core.js'

  const key = createSquircleKeycap(document.querySelector('#key'), { legend: 'K' })
  key.start()
</script>
```

**React.**

```tsx
import { useEffect, useRef } from 'react'
import { createSquircleKeycap } from '@/beamish/effects/squircle-keycap/core'

export function Key({ legend }: { legend: string }) {
  const host = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!host.current) return
    const key = createSquircleKeycap(host.current, { legend })
    key.start()
    return () => key.destroy()
  }, [legend])

  return <div ref={host} className="size-40" />
}
```

**Vue.**

```vue
<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue'
import { createSquircleKeycap } from '@/beamish/effects/squircle-keycap/core'
import type { EffectHandle } from '@/beamish/shared/runtime'

const host = ref<HTMLElement | null>(null)
let key: EffectHandle | null = null

onMounted(() => {
  if (!host.value) return
  key = createSquircleKeycap(host.value, { legend: 'K' })
  key.start()
})

onBeforeUnmount(() => key?.destroy())
</script>

<template>
  <div ref="host" class="key" />
</template>
```

**Astro.** Nothing extra is required. The core is a standard ES module and works
from a plain `<script>` in the page.

## 4. Options

Every option, with its default and the range that actually looks good. Pass them
as the second argument to the create function; anything omitted takes its default.

| Option | Type | Default | Range | What it does |
| --- | --- | --- | --- | --- |
| `plate` | color | `#efece3` | any CSS hex | The surface the key sits on. Slightly darker than the cap, because a key is lighter than the thing it is set into and that difference is most of what says it stands up. |
| `cap` | color | `#fbfaf6` | any CSS hex | The top of the key. |
| `side` | color | `#d6d1c4` | any CSS hex | The sides, which are what makes it a solid rather than a sticker. It wants to be a clear step darker than the cap: this is a facet turned away from the light, not a shadow. |
| `ink` | color | `#2b2a26` | any CSS hex | The legend, and the contact shadow under the key. |
| `legend` | string | `K` | any value | What is printed on the key. One or two characters: it is set at under a third of the key's width, and a word at that size is a label on a key rather than a key. |
| `corner` | number | `4.2` | 2 to 16 (looks right between 3 and 6) | The superellipse exponent. 2 is an ellipse, 4 is the shape everybody means by a squircle, and by 12 it is a rectangle with a hint of a corner. The useful range is narrow and the difference inside it is the whole item. |
| `size` | number | `0.56` | 0.15 to 0.9 | How much of the shorter side of the element the key takes up. |
| `depth` | number | `0.16` | 0.02 to 0.4 (looks right between 0.1 and 0.24) | How tall the key stands, as a share of its width. This is the thing the press has to eat into, so a flat key has nowhere to travel and reads as a flicker. |
| `travel` | number | `0.62` | 0.1 to 1 (looks right between 0.5 and 0.8) | How far down it goes when pressed, as a share of its height. At 1 it bottoms out flush with the plate, which reads as broken rather than as pressed. |
| `snap` | number | `0.13` | 0.03 to 0.6 (looks right between 0.08 and 0.2) | Seconds the key takes to come back up. The way down is fixed and fast, because that is a key hitting a stop; this is the rubber dome, and it is the only half with any character in it. |

## 5. The shape is the point

`border-radius` gives you a rectangle with circular arcs stuck on the corners.
The join between the straight edge and the arc is continuous in position and in
direction, but not in curvature: curvature goes from zero to one over the
radius, instantly, at that one point. Nobody can name that when they see it and
everybody can see it.

A superellipse has no join at all. It is one equation the whole way round,
`|x/a|^n + |y/b|^n = 1`, and the curvature rises and falls smoothly through the
corner. It is the shape a keycap, a phone icon and a Braun dial have been for
far longer than anyone has said "squircle".

It is walked as a path here rather than approximated with Bézier curves, so
`corner` is a real control rather than a lookalike. 2 is an ellipse, 4 is the
shape everybody means, and by 12 it is a rectangle with a suggestion of a
corner. No value of `border-radius` lands on any of them.

One implementation note, because it is the thing that goes wrong: the exponent
has to be applied to the absolute value and the sign put back afterwards. A
fractional power of a negative number is not a number, and the left half of the
shape is simply never drawn.

## 6. How a key can travel without keeping state

`renderAtTime` has to be pure in `t`, and a key is state between frames by
nature: whether it is down depends on something that happened earlier.

The resolution is to keep the list of **presses** rather than the position, and
work the displacement out from the clock each frame. Scripted presses are read
from the options every frame rather than remembered, so seeking backwards
unpresses the key. A spring integrated frame by frame can never do that, and
the recorder would get a different take every time it ran.

The displacement itself is an attack and a decay rather than a spring, because
a keycap does not oscillate: it goes down against a stop, which is fast and
ends abruptly, and comes back on a rubber dome, which is slower and settles
without overshoot. Two exponentials say that in one line.

## 7. It is a drawing of a control, not a control

This matters more here than for anything else in the library, because it looks
exactly like a thing you would click to do something.

A canvas has no role, no focus, no label and no keyboard handling, and none of
that can be added to it. If the key is going to **do** something, put a real
`<button>` on the page and mount this inside it:

```html
<button class="key" aria-label="Run the task">
  <span data-keycap style="display: block; width: 100%; height: 100%"></span>
</button>
```

Mount on the inner span, give the button the usual reset and a focus ring of
its own, and you have a real control with this as its face. Everything that
makes a button a button stays in the DOM where screen readers and keyboards can
find it.

## 8. The legend is set in the host's font

Deliberately: a thing pasted into somebody else's page should look like it
belongs to that page. It reads the computed `font-family` of the element it is
mounted on, so set that where you want it rather than passing a face in.

One or two characters. It is drawn at under a third of the key's width, and a
word at that size is a label on a key rather than a key.

## 9. Getting the press to read

The travel is legible because the **side** gets shorter, not because the face
moves: the face moving a few pixels is almost invisible, and the band of colour
below it collapsing is not.

So the two settings that matter are `depth` and `travel`. A key with too little
`depth` has nowhere to go and the press reads as a flicker. A `travel` of 1
bottoms the cap out flush with the plate, which reads as broken rather than as
pressed. The defaults keep a visible lip at the bottom of the stroke.

`side` wants to be a clear step darker than `cap`. It is a facet turned away
from the light, not a shadow, and treating it as a shadow is what makes these
look like stickers.

## 10. Cost

0.5ms: two filled paths of a hundred and twenty points, a clipped gradient and
one glyph. It holds no WebGL context, which is the reason it is 2D: a key is
something you want several of on a page, and the context budget is one.

## 11. Cleanup and SSR

`destroy()` removes the press listener, cancels the RAF, disconnects both
observers and clears the canvas.

There is nothing to render on the server. The element is empty until the first
frame. Call `createSquircleKeycap` from `useEffect`, `onMounted`, or a
`client:*` island.

## 12. Pausing and reduced motion

Handled in the runtime. Under reduced motion the loop never starts and one
frame is drawn, which is the key at rest. The press is a response to an action
rather than ambient movement, so there is nothing here that needs pausing.

## 13. The three mistakes most likely to be made here

1. **Using it as a button.** It is a picture. Put a real `<button>` round it.

2. **Too little `depth`.** The press has nowhere to go and reads as a flicker
   rather than as travel.

3. **A `side` that is nearly the same colour as the cap.** The extrusion
   disappears and you have a flat shape with a shadow, which is the thing a
   superellipse was supposed to save you from.

4. **A long word as the legend.** It is set at a third of the key's width.

5. **Raising `corner` past about 8 to make it look crisper.** It stops being a
   squircle and becomes a rounded rectangle, which you could have had from CSS
   for nothing.

## Ready-made wrappers

If you would rather not hand-write the wiring, these are the same thing as a
drop-in file. They contain no effect logic.

- https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/effects/squircle-keycap/adapters/react.tsx
- https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/effects/squircle-keycap/adapters/vue.ts

---

When you are done, confirm the effect renders and that its cleanup runs on
unmount. If something does not work, the most likely cause is at the top of the
mistakes list above, not in the shader.
