## What it is

GlassCrystal is a cut solid of glass turning slowly in front of the page, with
what is behind it genuinely bent through it rather than blurred.

## Real transmission, not a frosted overlay

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

## The thing it is easy to get wrong

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

## A bend is only visible against something straight

That is the general rule and it is worth keeping once you put your own content
behind this. Refraction displaces; displacement is only legible where there
was a known position to be displaced from.

Good things to put behind it: rules, a baseline grid, columns of type, a hard
horizon, anything with edges. Bad things: a photograph of foliage, a soft
gradient, a blurred image, a flat brand colour. Those are the same cases that
make glass in a flat interface fall flat, and for the same reason.

`rules: 0` turns the sheet back into a plain wash, which is the quickest way to
see the grey lump this is built to avoid.

## The environment is built, not loaded

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

## Wiring

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

## Tuning it

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

## Cleanup and SSR

`destroy()` releases the WebGL context, the geometry, both materials and the
prefiltered environment, cancels the RAF, disconnects the observers and
removes every listener. One live context at a time is the budget, so call it.

There is nothing to render on the server. The element is empty until the
script runs, so give it a height in CSS or the page will reflow when it
mounts.

## Accessibility

The solid is decorative and the canvas carries nothing for assistive
technology, by design. Put the real content in the document, not behind the
glass as a texture.

Under reduced motion the loop never starts and one frame is drawn, the one at
`reducedMotionTime`. The solid is simply there, at an angle chosen to show the
facets rather than at whatever angle zero happens to be.

## Common mistakes

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
