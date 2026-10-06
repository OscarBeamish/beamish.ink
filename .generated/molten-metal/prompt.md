You are adding **MoltenMetal** from Beamish to this project.

> Heat tint on brushed steel, coloured by thin-film interference rather than by a palette. Backdrops · effect · MIT.
> https://beamish.ink/effects/molten-metal

Beamish is not a package and there is nothing to install from npm. The source
lives in a public repo; you fetch the files, put them in this project, and wire
them in. Adapt them to whatever this project already uses. That is the point of
shipping it this way.

Assume you have not seen this library before. Everything you need is below.

## What it needs

- **npm dependencies:** None. This file has no npm dependencies at all.
- WebGL2. There is no WebGL1 fallback
- Built for a dark ground and declared as one. The colour is a reflection off a film, so it needs something dark underneath to reflect against
- The highlight is anisotropic, which is most of what says metal rather than oil: rolled and brushed steel is covered in fine parallel grooves, so a point of light smears into a line across the grain rather than reflecting as a point. The normal is compressed along the grain before the highlight is worked out, which gives the same streak for nothing
- The colour is thin-film interference, the same physics that colours an oil slick, a soap bubble, anodised titanium and steel heated in air. Light reflecting off the top of the film and light reflecting off the bottom travel different distances, and each wavelength cancels at a different thickness
- That is why it is not a hue ramp: the path difference depends on the angle light takes through the film, so tilting the surface shifts the colour, and the bands repeat order after order as the thickness grows. A gradient between two colours can do neither
- Snell's law is applied, so the angle used is the one inside the film rather than outside it. At a glancing angle the two differ by most of a band, which is where the film is most visible
- The half-wavelength phase flip on reflection off a denser medium is in the expression. Leave it out and every colour is its own complement, which looks plausible until you hold it next to a photograph of a soap film
- The surface normal is the analytic derivative of the same sum of waves that makes the height, not a sampled difference. A sampled normal quantises to the sample spacing and the flat runs come out faceted
- Every moving term is a sum of waves whose time coefficients are whole numbers of turns over the period, so the loop closes exactly
- One WebGL2 context, one full-screen triangle, no buffers and no attributes
- The creases are what a streak of light runs along, so the fold stays sharp. Softening it was tried and it takes the highlights with it, leaving something that reads as painted sheets
- A DOM element with a real size. The canvas fills its host, so a host with no height renders nothing.

Pinned to `{{PIN}}`. These URLs do not move; a future refactor gets a new tag.

## 1. Fetch these files

Fetch each URL and save it at the path given. Adjust the paths to match this
project's conventions, but keep them in the same relative arrangement. The
import between them is relative.

| Save as | Fetch from |
| --- | --- |
| `src/beamish/effects/molten-metal/core.ts` | https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/effects/molten-metal/core.ts |
| `src/beamish/shared/runtime.ts` | https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/shared/runtime.ts |

If you cannot fetch these URLs, say so. Do not write the file from memory. There
is a version of this prompt with the source inlined, and a guessed shader
compiles and looks wrong.

## 2. What it is

Heat tint on brushed steel, on a dark ground.

The colour is **thin-film interference**, which is the same thing that colours
an oil slick, a soap bubble, anodised titanium, and steel that has been heated
in air. It is not a palette and not a hue ramp, and that difference is the whole
item.

Light reflecting off the top of a very thin transparent film and light
reflecting off the bottom of it travel different distances. Where that
difference is half a wavelength they cancel, and because each wavelength
cancels at a different thickness, what is left is a colour that belongs to the
film rather than to the paint.

```glsl
vec3 reflectance(float opd, float top) {
  float base = top + 0.85;              // the metal underneath reflects 85%
  float swing = 2.0 * sqrt(top * 0.85); // and the film's own surface, this much
  return base + swing * cos(TAU * opd / lambda + PI);
}
```

Three things fall out of that, and they are what make it read as metal:

**The colour follows the slope, not the position.** The path difference depends
on the angle light takes through the film, so tilting the surface moves the
colour. A gradient between two colours cannot do that, and the moment you put
them side by side it is obvious which is which.

**The bands repeat.** Thickness keeps increasing, the cancellation comes round
again, and you get order after order of the same sequence, paler each time.

**It lives at the rim.** Reflection off the film is strongest at a glancing
angle, so the colour is strongest where the surface turns away from you.

## 4. Options

Every option, with its default and the range that actually looks good. Pass them
as the second argument to the create function; anything omitted takes its default.

| Option | Type | Default | Range | What it does |
| --- | --- | --- | --- | --- |
| `metal` | color | `#6f757e` | any CSS hex | The metal under the film, as its own reflectance. A steel grey is the honest starting point: the darkness in the frame comes from the lighting rather than from the base colour, and a base dark enough to be a backdrop on its own leaves the interference nothing to tint. |
| `scale` | number | `0.34` | 0.2 to 4 | Size of the swell. Lower is fewer and larger features, which is what you want full screen; higher packs the bands tighter and starts to read as fabric rather than metal. |
| `relief` | number | `0.5` | 0.05 to 2 | How steep the surface is. It scales the slope rather than the height, because what the eye reads is the angle, and the angle is what the colour is a function of. |
| `flow` | number | `0.16` | 0 to 1.2 | How far the surface is dragged out of shape before it is read. At 0 it is five plane waves added together, which is quasi-periodic however the directions are chosen and shows its lattice the moment there is any contrast. This is what turns that into swirls and folds, and it is the difference between a surface and a pattern. |
| `film` | number | `300` | 150 to 1200 nm | Mean thickness of the film in nanometres, and the one control that picks the colour family, exactly as it does on a real piece of steel: 230 is straw, 300 the blues and golds this ships with, 400 the purples. Worth moving before anything else if the colour looks dingy, because a thickness between the clean bands gives a muddy olive that no other setting will rescue. |
| `variation` | number | `0.14` | 0 to 1 | How much the thickness follows the surface. At 0 the colour comes only from the viewing angle, which is the cleaner and colder look; raising it makes the bands follow the shape the way a real oxide does. |
| `iridescence` | number | `0.9` | 0 to 6 | How far the interference is pushed past its physical strength. 1 is the real thing for a surface seen face on, and it is paler than people expect, because every photograph of oil on a puddle is taken at a glancing angle where the two reflections are closer in strength and the colour goes vivid. At 0 this is a dark lit metal with a sheen on it, which is a perfectly good quiet backdrop. |
| `sheen` | number | `0.9` | 0 to 1.5 | Strength of the specular highlight, which is the light itself rather than the film. It is what tells you the surface is polished. |
| `shine` | number | `22` | 4 to 160 | Tightness of that highlight. Low is a broad satin sheen across the whole swell; high is a small hard glint on the one facet pointing at the light. |
| `brush` | number | `0.9` | 0 to 0.95 | How brushed the metal is. Rolled and brushed steel is covered in fine parallel grooves, so a point of light reflects as a line across the grain rather than as a point: that streak is most of what tells the eye it is looking at metal rather than at oil on water. At 0 the surface is polished and the highlight is a blob. |
| `lightX` | number | `0.35` | -1 to 1 | Light direction across the frame. The highlight moves with it because the surface is lit rather than painted. |
| `lightY` | number | `0.6` | -1 to 1 | Light direction up the frame. Positive is from above, which is where light usually is and where the eye expects it. |
| `grain` | number | `0.3` | 0 to 1 | The sensor noise of a long exposure. Static rather than crawling: film grain that moves is a different effect and a far noisier one. |
| `period` | number | `48` | 12 to 120 s | Seconds for one full cycle, and the pace control. Long on purpose: a backdrop has to survive being ignored, and iridescence that hurries is a screensaver. |

## 5. Cleanup and SSR

`destroy()` releases the context, deletes the program and the VAO, cancels the
RAF and disconnects the observers. Call it.

None of this runs on the server. Put the call inside `useEffect`, `onMounted`,
or a `client:*` island. Next.js App Router needs `'use client'`, which is
already on the React adapter.

## 6. Pausing and reduced motion

Handled in the runtime, and non-negotiable: WCAG 2.2.2 is Level A and it
describes every ambient backdrop. The handle has `stop()` and `start()`.

Also handled in the runtime. Under `prefers-reduced-motion: reduce` the loop
never starts and one frame is drawn, at `reducedMotionTime`.

## 7. The three mistakes most likely to be made here

1. **A pale metal.** The colour is a reflection off the film. On a light base
   there is nothing for it to reflect against and the whole effect washes out.

2. **Reaching for the hue.** If the colours are wrong, the control is `film`,
   not a hue rotation. Rotating the hue breaks the one thing that makes this
   read as a material: that the sequence of colours is the sequence a real film
   goes through.

3. **Flattening it.** At low `relief` there is no angle for the interference to
   vary over, so you get a flat wash. The colour needs the shape.

4. **Turning `variation` up to get more colour.** It gives you more colour and
   less of it is good colour: the bands run through the muddy gaps between the
   clean ones. Pick the family with `film` and leave the variation low.

5. **Expecting it on paper.** `ground` says dark.

## Ready-made wrappers

If you would rather not hand-write the wiring, these are the same thing as a
drop-in file. They contain no effect logic.

- https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/effects/molten-metal/adapters/react.tsx
- https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/effects/molten-metal/adapters/vue.ts

---

When you are done, confirm the effect renders and that its cleanup runs on
unmount. If something does not work, the most likely cause is at the top of the
mistakes list above, not in the shader.
