You are adding **GlassCrystal** from Beamish to this project.

> A cut solid of glass turning in front of the page, refracting what is behind it. Backdrops · effect · MIT.
> https://beamish.ink/effects/glass-crystal

Beamish is not a package and there is nothing to install from npm. The source
lives in a public repo; you fetch the files, put them in this project, and wire
them in. Adapt them to whatever this project already uses. That is the point of
shipping it this way.

Assume you have not seen this library before. Everything you need is below.

## What it needs

- **npm dependencies:** `three@>=0.163.0`
- WebGL2. There is no WebGL1 fallback
- Transmission renders the scene behind the object into a buffer and refracts that buffer, so what you see through the solid is really what is behind it. It is not a blur, a frosted overlay or a rainbow texture, and none of those three can be made to bend a straight line the way this does.
- dispersion arrived in three 0.163. On an older copy the property is simply ignored: the glass still works and the colour at the edges disappears, with no error to tell you why, which is why the peer range starts there rather than at 0.160 like the rest of the three.js items.
- The environment is built at runtime rather than loaded. Transmission has to have something to reflect or the glass returns a grey blob, and the usual answer is an HDR file, which is a megabyte of asset and a network request for an effect that is otherwise two files. Four emissive planes are rendered into a cube and prefiltered through PMREMGenerator instead: a key, a fill opposite it, a soft top and a dark floor, which is a lighting setup rather than a photograph of a room.
- Tone mapping is on, which is unusual in this library. Transmission plus a specular off a bright environment goes well past 1 on the highlights, and without a curve those clip to flat white discs that read as holes punched in the glass rather than as light on it.
- Flat shading at detail 0 is what makes it read as cut rather than blown, and it needs per-face normals, which three only computes on a non-indexed geometry.
- A DOM element with a real size. The canvas fills its host, so a host with no height renders nothing.

Pinned to `{{PIN}}`. These URLs do not move; a future refactor gets a new tag.

## 1. Fetch these files

Fetch each URL and save it at the path given. Adjust the paths to match this
project's conventions, but keep them in the same relative arrangement. The
import between them is relative.

| Save as | Fetch from |
| --- | --- |
| `src/beamish/effects/glass-crystal/core.ts` | https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/effects/glass-crystal/core.ts |
| `src/beamish/shared/runtime.ts` | https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/shared/runtime.ts |

If you cannot fetch these URLs, say so. Do not write the file from memory. There
is a version of this prompt with the source inlined, and a guessed shader
compiles and looks wrong.

## 2. What it is

GlassCrystal is a cut solid of glass turning slowly in front of the page, with
what is behind it genuinely bent through it rather than blurred.

## 3. Wire it in

**Plain HTML.** The element is a container; the effect fills it.

```html
<div id="stage" style="position: relative; height: 70vh"></div>

<script type="module">
  import { createGlassCrystal } from './beamish/effects/glass-crystal/core.js'

  const crystal = createGlassCrystal(document.querySelector('#stage'))
  crystal.start()
</script>
```

**React.**

```tsx
import { useEffect, useRef } from 'react'
import { createGlassCrystal } from '@/beamish/effects/glass-crystal/core'

export function Crystal() {
  const host = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!host.current) return
    const crystal = createGlassCrystal(host.current, { rules: 16 })
    crystal.start()
    return () => crystal.destroy()
  }, [])

  return <div ref={host} style={{ position: 'relative', height: '70vh' }} />
}
```

**Vue.** The component takes the same options as props.

**Astro.** Nothing extra is required. The core is a standard ES module.

## 4. Options

Every option, with its default and the range that actually looks good. Pass them
as the second argument to the create function; anything omitted takes its default.

| Option | Type | Default | Range | What it does |
| --- | --- | --- | --- | --- |
| `paper` | color | `#fbfaf4` | any CSS hex | The page behind the glass, and the colour the frame is cleared to. The sheet that gets refracted is built from this, so it sets what the solid is full of. |
| `glass` | color | `#f4f7fb` | any CSS hex | The tint the glass leaves on light that passes through it. This is an attenuation colour, not a surface colour: it is what a given thickness of the material takes out, so the tint deepens where the solid is thick and all but disappears at a thin edge. Setting the surface colour instead paints the object, which is what makes stage-prop glass look like coloured plastic. |
| `key` | color | `#ffd9a8` | any CSS hex | The warm light, one of the two the environment is built from, and the wash on the sheet behind. Warm against a cool fill is what gives the solid two different colours to catch on opposite faces, which is most of what stops it reading as a grey lump. |
| `fill` | color | `#bcd4ff` | any CSS hex | The cool light, opposite the key. Equal to the key in brightness and opposite it in hue is the safe setting; pushing them together flattens the solid. |
| `detail` | number | `0` | 0 to 3 (looks right between 0 and 1) | Faces. 0 is a twenty-sided solid with flat shading, which is the cut gem. Each step up quadruples the faces and rounds it off, and by 3 it is a glass ball, which is a less interesting object and a more expensive one. |
| `size` | number | `1.5` | 0.4 to 3 (looks right between 1.1 and 2) | How large the solid is in the frame. Past about 2.2 it reaches the edges and stops being an object on a page. |
| `thickness` | number | `1.1` | 0 to 5 (looks right between 0.6 and 2) | How much glass the light is treated as travelling through, which is what the tint and the bending are scaled by. At 0 it is a soap bubble: a surface with nothing inside it. |
| `ior` | number | `1.46` | 1 to 2.4 (looks right between 1.3 and 1.8) | Refractive index, and the one number here that is a physical quantity rather than a taste. 1.0 is air and bends nothing, 1.5 is window glass, 2.4 is diamond. Above about 1.9 the solid stops transmitting the page and starts mirroring the environment, which is the right look for a gem and the wrong one for a backdrop. |
| `dispersion` | number | `1.6` | 0 to 5 (looks right between 0.8 and 2.5) | How far the colours separate at the edges, by refracting red, green and blue at slightly different indices. This is where the colour fringing comes from and there is no rainbow texture anywhere in the effect. At 0 the glass is colourless and noticeably duller. |
| `roughness` | number | `0.04` | 0 to 0.6 (looks right between 0 and 0.15) | Frosting. 0 is polished. Past about 0.2 what is behind the glass stops being legible, which is the whole point of putting it there. |
| `iridescence` | number | `0.3` | 0 to 1 (looks right between 0 and 0.5) | Thin-film colour on the surface, the way oil goes on water. A little reads as a coating on the glass; at 1 it reads as a soap bubble and fights the dispersion for the same job. |
| `rules` | number | `16` | 0 to 64 (looks right between 10 and 28) | Rules across the sheet behind the glass, and the thing the bending is actually visible as. A bend can only be seen as the displacement of something straight, so with no rules the solid is a grey lump however correct the optics are: measured, the shipped version with one hairline rule had a luminance range of 2 out of 255 inside the solid against 26 with these. At 0 the sheet is a plain wash and you get that lump back, which is worth seeing once. |
| `ruleWeight` | number | `0.45` | 0 to 1 (looks right between 0.25 and 0.6) | How dark the rules are, as a fraction taken out of the paper. This is the one dial that changes how much glass you can see, because what reaches you through the solid is a dimmer, averaged copy of what is behind it: the contrast inside tracks this almost linearly and lands at about a fifteenth of the contrast on the open sheet. Past about 0.6 the sheet stops being a backdrop and starts being the subject. |
| `drift` | number | `0.12` | 0 to 1 (looks right between 0.05 and 0.3) | How far it rises and falls over a period, in scene units. One rise and fall per period, so it closes with the turn. At 0 it only turns. |
| `period` | number | `44` | 4 to 120 (looks right between 24 and 60) | Seconds for one turn, and the length of the loop. Both rotation axes and the rise are whole multiples of this same phase, which is what makes the take close exactly. Slow is the point: this is a thing in the corner of a page, not an animation anybody is meant to watch. |

## 5. Real transmission, not a frosted overlay

The usual browser glass is `backdrop-filter: blur()`. That softens what is
behind, which is what frosted glass does, and it is the wrong model for a
solid: a blur cannot displace a straight line, and displacement is the whole
signal that something is being looked through.

This uses `MeshPhysicalMaterial` with `transmission`, which renders the scene
behind the object into a buffer and samples that buffer along a refracted ray.
So the rules on the sheet behind really do step sideways as they cross each
facet, and they step by different amounts on facets at different angles,
because the angle is what the refraction is computed from.

`dispersion` then samples red, green and blue at slightly different indices.
That is where the colour at the edges comes from. There is no rainbow texture
anywhere in this effect, and there is no gradient faking one.

## 6. The thing it is easy to get wrong

**Glass with nothing behind it is a grey lump.** This is worth stating plainly
because the first version of this effect was exactly that, and the optics were
never the problem.

The sheet behind it carried a soft wash and one hairline rule. Measured in the
page, the luminance range inside the solid was **2 out of 255**. It looked
like a smudge, and the instinct is to reach for the glass: raise the
refractive index, raise the dispersion, dim the environment. None of that
moved it.

The proof it was not the glass is a one-line test. **Turn transmission off.**
The solid became *more* varied, not less, going from a range of 2 to 20. That
is only possible if transmission was working and was averaging a flat buffer
into a flat result. The glass was faithfully showing you a blank page.

So the sheet is ruled. With the same optics and nothing else changed, the
range inside the solid went from 2 to **26**.

## 7. A bend is only visible against something straight

That is the general rule and it is worth keeping once you put your own content
behind this. Refraction displaces; displacement is only legible where there
was a known position to be displaced from.

Good things to put behind it: rules, a baseline grid, columns of type, a hard
horizon, anything with edges. Bad things: a photograph of foliage, a soft
gradient, a blurred image, a flat brand colour. Those are the same cases that
make glass in a flat interface fall flat, and for the same reason.

`rules: 0` turns the sheet back into a plain wash, which is the quickest way to
see the grey lump this is built to avoid.

## 8. The environment is built, not loaded

Transmission also needs something to reflect or the material comes back dark.
The usual answer is an HDR file, which is a megabyte of asset and a network
request for an effect that is otherwise two files.

This builds one: four emissive planes in a scene of their own, rendered into a
cube and prefiltered. A key, a fill opposite it, a soft top and a dark floor.
It is a lighting setup rather than a photograph of a room, which is also why
`key` and `fill` are real controls rather than decoration.

It is rebuilt only when one of the colours that defines it changes, keyed on
those colours. Rebuilding it every frame is the mistake that turns a cheap
effect into an expensive one, and nothing on screen tells you it is happening.

## 9. Tuning it

1. **`ruleWeight`.** The one dial that changes how much glass you can see.
   What reaches you through the solid is a dimmer, averaged copy of the sheet,
   so the contrast inside tracks this almost linearly and lands at roughly a
   fifteenth of the contrast on the open sheet. Past about 0.6 the sheet stops
   being a backdrop and becomes the subject.
2. **`ior`.** The one physical quantity here. 1.5 is window glass. Above about
   1.9 the solid stops transmitting the page and starts mirroring the
   environment, which is right for a gem and wrong for a backdrop.
3. **`detail`.** 0 is a twenty-sided solid with flat shading, which is the cut
   gem and the interesting one. By 3 it is a glass ball.
4. **`dispersion`.** The colour at the edges. At 0 the glass is colourless and
   noticeably duller.
5. **`period`.** Slow is the point. This is a thing in the corner of a page,
   not an animation anybody is meant to watch.

## 10. Accessibility. Do not skip this

The solid is decorative and the canvas carries nothing for assistive
technology, by design. Put the real content in the document, not behind the
glass as a texture.

Under reduced motion the loop never starts and one frame is drawn, the one at
`reducedMotionTime`. The solid is simply there, at an angle chosen to show the
facets rather than at whatever angle zero happens to be.

## 11. Cleanup and SSR

`destroy()` releases the WebGL context, the geometry, both materials and the
prefiltered environment, cancels the RAF, disconnects the observers and
removes every listener. One live context at a time is the budget, so call it.

There is nothing to render on the server. The element is empty until the
script runs, so give it a height in CSS or the page will reflow when it
mounts.

## 12. The six mistakes most likely to be made here

1. **Putting nothing behind it.** The failure this effect was rescued from. A
   flat colour, a soft gradient or a blurred photograph gives refraction
   nothing to displace, and no amount of index or dispersion will save it. Put
   something straight back there.

2. **Diagnosing it as the glass.** When it looks like a lump, the instinct is
   to raise `ior` and `dispersion` and dim the environment. Turn `transmission`
   off for one frame instead: if the solid gets *more* varied, the optics were
   fine and the backdrop is empty.

3. **Reaching for `backdrop-filter` instead.** A blur softens, it does not
   displace, so it can never bend a straight line. If what you want is frosted
   glass then a blur is correct and cheaper; if you want a solid, it cannot do
   it at any setting.

4. **Rebuilding the environment every frame.** It is a cube render plus a
   prefilter pass, and nothing on screen tells you it is happening. Key it on
   the colours that define it.

5. **Measuring the rules in UV without `fwidth`.** The sheet is scaled to cover
   the frame at its own depth, so a fixed width in UV is a different width in
   pixels at every viewport, and the rules alias into a moire the moment the
   frame is not 16:9. Through a refracting solid that moire is what you see.

6. **Tinting the surface colour.** Glass is not a colour, it is what a
   thickness of material takes out of the light crossing it. Set
   `attenuationColor` and let `thickness` scale it. Painting the surface is
   what makes stage-prop glass read as coloured plastic.

## Ready-made wrappers

If you would rather not hand-write the wiring, these are the same thing as a
drop-in file. They contain no effect logic.

- https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/effects/glass-crystal/adapters/react.tsx
- https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/effects/glass-crystal/adapters/vue.ts

---

When you are done, confirm the effect renders and that its cleanup runs on
unmount. If something does not work, the most likely cause is at the top of the
mistakes list above, not in the shader.
