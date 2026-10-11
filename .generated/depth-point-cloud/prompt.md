You are adding **DepthPointCloud** from Beamish to this project.

> A photograph taken apart into points and pushed into depth by its own brightness. Surfaces · effect · MIT.
> https://beamish.ink/effects/depth-point-cloud

Beamish is not a package and there is nothing to install from npm. The source
lives in a public repo; you fetch the files, put them in this project, and wire
them in. Adapt them to whatever this project already uses. That is the point of
shipping it this way.

Assume you have not seen this library before. Everything you need is below.

## What it needs

- **npm dependencies:** `three@>=0.160.0`
- WebGL2. There is no WebGL1 fallback
- There is no depth map, and the item does not pretend otherwise. It reads luminance and treats it as height, which is wrong about the world and right about photographs: a photographer lights the subject and lets the ground fall away, so in most pictures the bright parts really are nearer. A bright sky or a dark subject breaks it, and `relief` is how much you are willing to claim
- Rec. 709 luminance rather than the average of the channels. The eye is far more sensitive to green than to blue, and an average puts a blue sky and a green field at the same height when nobody sees them that way
- Every point keeps the colour of the pixel it came from, which is what keeps the picture readable as it comes apart. A point cloud in one colour is an abstract, and an abstract is a much weaker thing than a photograph you can still recognise
- The picture is read by drawing it into a small canvas at grid resolution and reading that back, so every cell is a proper average. Picking every nth pixel of the full-size image aliases badly, and a photograph is nothing but detail
- The wander is in the vertex shader. Twenty thousand points moved on the CPU is twenty thousand vectors uploaded every frame; moved on the GPU it is one uniform, and the positions never change
- Each point carries a phase, so the cloud does not travel as a sheet, and the displacement is a sine of whole turns per period, so every point is exactly where it started when the loop comes round
- Point size falls off with distance. Without that the far points are as large as the near ones and the whole thing flattens into a texture, which is the usual way this kind of effect fails
- Points are round, cut from the square the hardware gives you. Square points read as a screen door laid over the picture: the grid becomes the subject
- The cloud turns a little either side of square-on rather than rotating. A point cloud seen edge-on is a line and a photograph seen from behind is nothing, so the useful range is small
- Built for a dark ground and declared as one. The points are the picture's own colours against the fill, and on paper the pale half of the photograph disappears into the page
- The <img> may not have decoded when the effect mounts, so the cloud is built on the first frame where the picture is readable rather than once at setup. A cross-origin image taints the canvas and cannot be read back at all, in which case nothing is drawn
- The phase hash is a sine hash of the two grid coordinates, not the index times a constant. Walking the index through a modulus steps through phases in a regular cycle, and since the index runs along each row that cycle lines up with the grid: the first version drew visible vertical stripes across the whole cloud, which is the grid announcing itself
- The default density is as much about the codec as about the picture. A field of tiny high-contrast dots is the worst case a video encoder can be given: at 240 across, the take came out at 57MB against a 3500kB budget, which is sixteen times over and not a thing crf can rescue. Fewer and slightly larger points compress enormously better and, as the recipe already said, read better at card size, so the coarsening was owed anyway
- A DOM element with a real size. The canvas fills its host, so a host with no height renders nothing.

Pinned to `{{PIN}}`. These URLs do not move; a future refactor gets a new tag.

## 1. Fetch these files

Fetch each URL and save it at the path given. Adjust the paths to match this
project's conventions, but keep them in the same relative arrangement. The
import between them is relative.

| Save as | Fetch from |
| --- | --- |
| `src/beamish/effects/depth-point-cloud/core.ts` | https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/effects/depth-point-cloud/core.ts |
| `src/beamish/shared/runtime.ts` | https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/shared/runtime.ts |

If you cannot fetch these URLs, say so. Do not write the file from memory. There
is a version of this prompt with the source inlined, and a guessed shader
compiles and looks wrong.

## 2. What it is

DepthPointCloud takes a photograph apart into points and pushes it into the
third dimension using its own brightness.

There is no depth map, and the item does not pretend there is. A photograph
does not carry one. This reads luminance and treats it as height, which is
wrong about the world and right about pictures: a photographer lights the
subject and lets the ground fall away, so in most photographs the bright parts
really are the near ones. Where that is false, which is a bright sky or a dark
subject, it fails interestingly rather than wrongly.

`relief` is how much you are willing to claim.

Every point keeps the colour of the pixel it came from, and that is the whole
trick. A point cloud in a single colour is an abstract; a photograph you can
still recognise while it comes apart is a much stronger thing.

## 3. Wire it in

**React.** `three` is a peer dependency.

```tsx
import { useEffect, useRef } from 'react'
import { createDepthPointCloud } from '@/beamish/effects/depth-point-cloud/core'

export function Cloud() {
  const host = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!host.current) return
    const cloud = createDepthPointCloud(host.current, { relief: 1.15 })
    cloud.start()
    return () => cloud.destroy()
  }, [])

  return (
    <div ref={host} className="absolute inset-0 -z-10">
      <img src="/photograph.jpg" alt="" className="hidden" />
    </div>
  )
}
```

Mount once. Option changes go through `update()` rather than a remount, because
a remount is a new WebGL context and the budget for those is small. `density`
and `relief` rebuild the cloud when they change; everything else is free.

**Vue.**

```vue
<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue'
import { createDepthPointCloud } from '@/beamish/effects/depth-point-cloud/core'
import type { EffectHandle } from '@/beamish/shared/runtime'

const host = ref<HTMLElement | null>(null)
let cloud: EffectHandle | null = null

onMounted(() => {
  if (!host.value) return
  cloud = createDepthPointCloud(host.value)
  cloud.start()
})

onBeforeUnmount(() => cloud?.destroy())
</script>

<template>
  <div ref="host" class="cloud">
    <img src="/photograph.jpg" alt="" style="display: none" />
  </div>
</template>
```

**Astro.** Nothing extra is required. The core is a standard ES module and works
from a plain `<script>` in the page.

## 4. Options

Every option, with its default and the range that actually looks good. Pass them
as the second argument to the create function; anything omitted takes its default.

| Option | Type | Default | Range | What it does |
| --- | --- | --- | --- | --- |
| `background` | color | `#0a0b0f` | any CSS hex | Behind the cloud. Dark, because the points carry the photograph's own colours and a pale fill swallows the pale half of it. |
| `relief` | number | `1.15` | 0 to 4 (looks right between 0.6 and 1.8) | How far the brightest points stand off the darkest, in scene units where the picture is two wide. This is the claim the item is making about the photograph, and it is a claim: at 0 it is a flat plane of points, and past about 2.5 the bright areas tear away from everything else. |
| `density` | number | `150` | 40 to 400 (looks right between 110 and 200) | Points across the picture. The square of this, near enough, is the point count, so it is the whole cost. Below about 100 the picture stops being recognisable, which is the thing worth keeping. |
| `size` | number | `0.026` | 0.002 to 0.06 (looks right between 0.014 and 0.032) | Point size in scene units, converted to pixels against the viewport height so it looks the same on a phone and a monitor. Large enough to close the gaps and the cloud becomes a solid sheet; small enough to see between them is the point. |
| `drift` | number | `0.008` | 0 to 0.4 (looks right between 0.004 and 0.03) | How far points wander from where the picture puts them. Very small: this is a photograph breathing, not a particle system. It is also the main thing that decides how busy the item is, and at 0.035 the whole frame changes faster than a backdrop should. Past about 0.1 the image stops being legible and you have confetti. |
| `spin` | number | `7` | 0 to 60 deg (looks right between 5 and 16) | Degrees the cloud turns either side of square-on. Enough to show the picture has thickness, not enough to lose the picture. |
| `period` | number | `40` | 8 to 120 s (looks right between 24 and 60) | Seconds for one cycle of the turn and the wander. Both complete whole turns in it, so the loop has no join. |
| `wash` | number | `0.25` | 0 to 1 | How far the points are pulled towards `ink`. At 0 you get the photograph's own colours, which is the most legible. At 1 the picture is one colour and reads as data rather than as a photograph, which is occasionally what you want. |
| `ink` | color | `#8fd8ff` | any CSS hex | The colour points are pulled towards. Only does anything when `wash` is above 0. |

## 5. The element needs an `<img>` in it

The picture is the input, not the output. It is read once and never shown.

```html
<div id="hero" style="height: 70vh">
  <img src="/photograph.jpg" alt="" />
</div>
```

Hide it with CSS. The effect reads it from the host element, so if there is no
`img` inside, mounting throws and says so.

Two things to know about that read. It happens on the first frame where the
picture is actually decodable rather than once at mount, because an `img` in
the markup may not have arrived yet and a surface that reads it once gets an
empty cloud for ever. And a cross-origin image taints the canvas and cannot be
read back at all: if your photograph is on another domain, serve it with CORS
headers or nothing will be drawn.

## 6. Three details that decide whether it works

**Rec. 709 luminance, not the average of the channels.** The eye is far more
sensitive to green than to blue, and averaging puts a blue sky and a green
field at the same height when nobody sees them that way.

**The picture is downscaled, not sampled.** It is drawn into a small canvas at
grid resolution and read back, so every point is the average of the cell it
came from. Picking every nth pixel of a full-size photograph aliases badly, and
a photograph is nothing but detail.

**Point size falls off with distance.** Without that the far points are as big
as the near ones and the whole thing flattens into a texture, which is the
usual way this kind of effect fails. It is also why `size` is in scene units
rather than pixels: converted against the viewport height, a point is the same
apparent size on a phone and on a monitor.

## 7. The stripes, which were the grid talking

The first version gave every point a phase with `index × constant % n`, which
is the usual quick hash. It drew visible vertical stripes across the entire
cloud.

The index runs along each row, so stepping through phases in a regular cycle
lines that cycle up with the grid, and the grid becomes visible in the
movement. A sine hash of the two coordinates separately has no such
relationship with either axis. Any hash you use here has to be decorrelated in
both directions, not just irregular.

## 8. Choosing a photograph

It wants a picture whose tones already describe its space: something lit in
front, something pale in the middle distance, something dark behind. A flatly
lit picture comes apart into a sheet with texture on it and proves nothing.

High-key pictures, where most of the frame is bright, give a cloud that is all
at the front. Pictures with a bright sky give a sky that hovers in front of the
subject, which is wrong but sometimes better than right.

## 9. It is for a dark ground

Declared `dark`. The points carry the photograph's own colours, which include
its pale ones, and on paper that half of the picture disappears into the page.
`wash` towards a dark ink is the nearest thing to a paper version and it is not
really one.

## 10. Cost and how busy it is

0.8ms at 1280 by 720, which is cheap: points cost very little and the movement
is all in the vertex shader, so nothing is uploaded per frame. Cost is the
square of `density`.

0.399 mean absolute change per frame on a 0 to 255 scale, against
MetaballField at 0.360 and WaterCaustics at 0.222. A field of small bright dots
is the hardest case for that measurement, because any movement switches whole
pixels between a dot and the background rather than shading them. `drift` and
`spin` are the dials: at `drift: 0.035` it measured 1.485, which is well past
the point where a backdrop has become something happening.

## 11. Cleanup and SSR

`destroy()` disposes the geometry, the material and the renderer, releases the
WebGL context, cancels the RAF, disconnects both observers and removes every
listener. One live context at a time is the budget, so call it.

There is nothing to render on the server. Call `createDepthPointCloud` from
`useEffect`, `onMounted`, or a `client:*` island. The `<img>` is ordinary
markup and can be server-rendered as usual.

## 12. Pausing and reduced motion

Handled in the runtime with a live `matchMedia` listener. Under reduced motion
the loop never starts and one frame is drawn instead, the one at
`reducedMotionTime`. A still of this is a photograph standing slightly off the
page, which is most of the idea.

## 13. The three mistakes most likely to be made here

1. **No `<img>` in the host.** It throws and tells you. The picture is an
   input, so it has to be in the DOM to be read.

2. **A cross-origin photograph without CORS headers.** The canvas is tainted,
   the pixels cannot be read back, and nothing is drawn. No error: there is
   nothing wrong, there is just nothing there.

3. **Too much `drift`.** It is the difference between a photograph breathing
   and confetti, and it is also the main thing that makes the item busy.

4. **Raising `density` to make the picture clearer.** Past the default it costs
   the square and buys very little: the limit on legibility is point size and
   drift, not point count.

5. **A flatly lit photograph.** Brightness is the only depth information there
   is. If the picture does not vary in tone, the cloud is a flat sheet.

## Ready-made wrappers

If you would rather not hand-write the wiring, these are the same thing as a
drop-in file. They contain no effect logic.

- https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/effects/depth-point-cloud/adapters/react.tsx
- https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/effects/depth-point-cloud/adapters/vue.ts

---

When you are done, confirm the effect renders and that its cleanup runs on
unmount. If something does not work, the most likely cause is at the top of the
mistakes list above, not in the shader.
