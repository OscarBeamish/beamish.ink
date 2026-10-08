You are adding **PointerLitBusts** from Beamish to this project.

> Three helmeted busts in a dark room, lit by the cursor carrying the only lamp. Pointer · effect · MIT.
> https://beamish.ink/effects/pointer-lit-busts

Beamish is not a package and there is nothing to install from npm. The source
lives in a public repo; you fetch the files, put them in this project, and wire
them in. Adapt them to whatever this project already uses. That is the point of
shipping it this way.

Assume you have not seen this library before. Everything you need is below.

## What it needs

- **npm dependencies:** `three@>=0.160.0`
- WebGL2. There is no WebGL1 fallback
- The forms are generated rather than loaded. A prompt here hands over source, and a decimated head scan is several megabytes of binary nobody can read, review or tune. A lathe profile and three primitives is a few hundred numbers and every part of it can be changed by somebody who has never opened a 3D tool
- The light moves in the world, on a plane in front of the busts, rather than in screen space. A light pinned to the cursor in two dimensions lights everything from the same angle wherever it goes, so the shading never changes and the scene reads as a flat image with a bright patch on it
- There is always a little rim light. On a dark ground an unlit form is not subtle, it is absent, and a reader who moves the cursor somewhere empty concludes the page is broken
- No shadow maps. A moving light and three solids is the case where real shadows look obvious and cost a second render pass every frame, and at this scale the shading says most of what a shadow would have
- A DOM element with a real size. The canvas fills its host, so a host with no height renders nothing.

Pinned to `{{PIN}}`. These URLs do not move; a future refactor gets a new tag.

## 1. Fetch these files

Fetch each URL and save it at the path given. Adjust the paths to match this
project's conventions, but keep them in the same relative arrangement. The
import between them is relative.

| Save as | Fetch from |
| --- | --- |
| `src/beamish/shared/runtime.ts` | https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/shared/runtime.ts |
| `src/beamish/effects/pointer-lit-busts/core.ts` | https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/effects/pointer-lit-busts/core.ts |

If you cannot fetch these URLs, say so. Do not write the file from memory. There
is a version of this prompt with the source inlined, and a guessed shader
compiles and looks wrong.

## 2. What it is

PointerLitBusts is three helmeted busts in a dark room where the cursor
carries the only lamp. Move it and the forms turn: a cheekbone catches, a
visor goes black, the one at the back comes out of the dark for a moment and
goes again.

Three things carry it, and the first is what separates this from a torch
cursor.

**The lamp moves through the world**, on a plane in front of the busts, not in
screen space. A light pinned to the cursor in two dimensions lights everything
from the same angle wherever it goes, so the shading never changes and the
scene reads as a flat image with a bright patch travelling over it. Moving the
light through the scene is what makes a form turn: the same cheek is lit from
the left, then from below, then not at all.

**There is always a little rim light.** On a dark ground an unlit form is not
subtle, it is absent, and a reader who moves the cursor into an empty corner
concludes the page is broken. A faint cool edge keeps all three present and
makes the lamp read as a lamp rather than as the only thing that exists.

**There are no shadow maps.** A moving light and three solids is exactly the
case where real shadows look obvious, and they cost a second render pass every
frame. The forms read from shading alone, which at this scale says most of
what a shadow would have.

## 3. Wire it in

**Plain HTML.** The element needs a size in CSS; the canvas fills it.

```html
<div id="room" style="width: 100%; height: 100vh"></div>

<script type="module">
  import { createPointerLitBusts } from './beamish/effects/pointer-lit-busts/core.js'

  const room = createPointerLitBusts(document.querySelector('#room'))
  room.start()
</script>
```

**React.**

```tsx
import { useEffect, useRef } from 'react'
import { createPointerLitBusts } from '@/beamish/effects/pointer-lit-busts/core'

export function Room() {
  const host = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!host.current) return
    const room = createPointerLitBusts(host.current, { lamp: 30 })
    room.start()
    return () => room.destroy()
  }, [])

  return <div ref={host} style={{ height: '100vh' }} />
}
```

**Vue.** Same shape: mount on a sized element in `onMounted`, `destroy()` in
`onBeforeUnmount`.

**Astro.** Nothing extra. The core is a standard ES module, and three.js is a
peer dependency the host project already has or installs.

## 4. Options

Every option, with its default and the range that actually looks good. Pass them
as the second argument to the create function; anything omitted takes its default.

| Option | Type | Default | Range | What it does |
| --- | --- | --- | --- | --- |
| `lamp` | number | `26` | 0 to 120 | Brightness of the lamp the cursor carries. |
| `lampColour` | color | `#ffe9c9` | any CSS hex | Colour of the lamp. Warm, so it reads as a lamp rather than as a screen. |
| `reach` | number | `3.2` | 0.5 to 10 | How far in front of the busts the lamp sits. |
| `sweep` | number | `7` | 1 to 20 | How far the lamp travels across the scene. |
| `rim` | number | `0.5` | 0 to 3 | The edge that keeps a form present when the lamp is elsewhere. |
| `rimColour` | color | `#6f86b8` | any CSS hex | Colour of the rim, which is the room rather than the lamp. |
| `room` | color | `#0a0a0c` | any CSS hex | The ground the busts stand in. |
| `parallax` | number | `0.35` | 0 to 2 | How far the camera drifts against the cursor. Zero holds it still. |
| `polish` | number | `0.42` | 0 to 1 | How polished the shell is. Low is stone, high is lacquer. |

## 5. The forms are generated, not loaded

There is no model file. The cast is a lathe profile and two primitives per
bust, which is a few hundred numbers.

That is deliberate. A prompt in this library hands over source you can read,
and a decimated head scan is several megabytes of binary that cannot be
reviewed, diffed or tuned. Generated, every part of the shape is a number in
the file: change the jaw line without opening a 3D tool.

It also means the thing cannot rot. There is no asset to go missing, no
licence to track and nothing to re-export when a format moves on.

## 6. It is for a dark ground

`ground: dark` is a statement about the design, not a warning. The rim light
has nothing to separate the forms from on paper, the specular on the visor has
nothing to be brighter than, and the whole thing goes flat.

If you need it on a light page, give the section its own dark band. That is
what the band and grid split exists for.

## 7. Tuning it

The two that matter are `lamp` and `reach`.

`lamp` is brightness, and the light falls off with the square of distance, so
doubling it does far less than you expect. `reach` is how far in front of the
busts the lamp sits: small values put it almost among them, which is dramatic
and leaves most of the scene black; large values flatten it towards a studio
light.

`sweep` is how far the lamp travels for a full crossing of the element. Larger
than the scene is good: the lamp should be able to leave.

`polish` runs the shell from stone to lacquer. The visor is always polished,
because that is what makes it read as glass rather than as a hole.

## 8. One context

The scene holds one WebGL context, which is the whole budget. If you want this
and a backdrop elsewhere on the same page, use the stage from `shared/` to
hand the context between them rather than mounting both.

## 9. Cleanup

`destroy()` disposes every geometry, every material, both lights and the
renderer, and releases the context. The context-leak test mounts and destroys
it fifty times and then asks the browser for a fresh context, which is the
only way to be sure.

## 10. Pausing and reduced motion

Handled in the runtime. Under reduced motion the loop never starts and one
frame is drawn, with the cursor wherever it last was or at the centre.

Nothing is lost that matters: a still of three lit busts is the composition.
What goes is the turning, which is the part that moves.

## 11. The three mistakes most likely to be made here

1. **Lighting in screen space.** The shading never changes, so the forms never
   turn and the scene is a photograph with a torch on it.

2. **No rim light.** Forms vanish completely and the page looks broken.

3. **Shadow maps.** A second pass per frame, for shadows that at this scale
   mostly duplicate what the shading already said.

4. **Loading a scan instead.** Megabytes of binary in a library whose whole
   premise is readable source.

5. **Putting it on paper.** It is built for a dark ground and says so.

6. **Sampling the canvas with `drawImage` to check it works.** The drawing
   buffer is cleared on composite, so it reads black while the scene is
   rendering perfectly. Take a screenshot instead.

## Ready-made wrappers

If you would rather not hand-write the wiring, these are the same thing as a
drop-in file. They contain no effect logic.

- https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/effects/pointer-lit-busts/adapters/react.tsx
- https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/effects/pointer-lit-busts/adapters/vue.ts

---

When you are done, confirm the effect renders and that its cleanup runs on
unmount. If something does not work, the most likely cause is at the top of the
mistakes list above, not in the shader.
