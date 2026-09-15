# Audit

A pass over all eleven built items: what is wrong with each, what the current
state of the art offers that we are not using, and what is worth changing.

Findings are marked **defect** (it is broken or lies), **improve** (it works and
could be better), or **watch** (the platform is moving and we should follow).

Fixed items say so. Everything else is a decision waiting to be made.

---

## Findings that applied to more than one item

### Shadow softness did nothing — **defect, fixed**

Sundial shipped a `softness` option with a documented range, a sensible band and
a paragraph in its prompt. It had no effect at all.

`shadow.radius` is only read by the `SHADOWMAP_TYPE_PCF` branch of three's shadow
shader. Under `PCFSoftShadowMap` the kernel is fixed and the value is ignored.
The names are the wrong way round: PCF is the configurable one.

Both three.js items now use `THREE.PCFShadowMap`, and Swell gained the same
control. Verified visually: at 0.68 the edges are genuinely blurred where before
they were hard at every setting.

This is the worst category of defect this project can produce. The prompt is the
product, and it was confidently documenting a number that did nothing.

**Still open:** VSM would be smoother than a widened PCF kernel, which shows
faint stepping at high radius. VSM brings light bleeding, which on white forms
against white paper may not matter. Worth a test.

### Per-frame allocation — **improve**

Three items allocate inside `render`:

- **Tally** constructs a new `Intl.NumberFormat` every frame. It is the single
  most expensive thing in the effect and the inputs change about once a mount.
  Cache it, keyed on locale and places.
- **Sundial and Swell** call `new THREE.Color(opts.paper)` every frame for the
  background. Reuse one instance.
- **Tilt** rebuilds the sheen gradient string every frame. Cheap, but it is
  string concatenation feeding a style recalculation, so it is not free.

None of these are visible at 60fps on a desktop. All of them are visible in a
profile, and one of the promises here is that the code is worth reading.

### `getBoundingClientRect` in the render loop — **defect**

**Magnet** calls it every frame while the cursor is in range. That forces a
synchronous layout on every mouse move, which is exactly the thing the rest of
the library is careful to avoid. The rect only changes on resize, and the runtime
already has a `ResizeObserver` that could cache it.

Left as it is for now because it needs a small addition to the `Surface`
contract: `resize` currently receives pixel dimensions, not the element rect.

### Reduced-motion frames are guesses — **improve**

Every item has a `reducedMotionTime`, and for most of them the default was picked
by eye rather than checked. The recorder already renders any frame on demand, so
`pnpm review` could screenshot each item at its reduced-motion time and put the
results in front of a human. For a meaningful fraction of visitors that single
frame is the entire effect and nobody has looked at nine of them.

---

## Per item

### Overprint

Works. The densest thing in the repo at 12MB of media, six times the next worst.

- **improve** The halftone uses a regular grid, which is why it is expensive to
  encode and why fine settings moiré against the pixel grid. A blue-noise or
  Bayer threshold would dither instead of tiling, cost less in the codec, and
  avoid the beat pattern entirely. It would also look less like a print, which is
  the whole point, so this is a real trade rather than a free win.
- **improve** `tone()` amplifies then windows with two hard-coded constants,
  1.7 and 0.30. Those are the two numbers most worth exposing, and neither is.
- **watch** Nothing in the platform threatens this. It is a fragment shader on a
  triangle and will still work in ten years.

### Sundial

- **defect, fixed** The softness control, above.
- **improve** The composition is one hand-placed arrangement. A second and third
  arrangement selectable by option would multiply the item's usefulness at almost
  no cost, and the table is already data.
- **improve** Materials are `MeshStandardMaterial` with no environment map. A
  tiny procedurally generated PMREM would put a soft studio reflection on the
  forms and cost one texture. This is the single biggest step up in how expensive
  the scene looks.
- **improve** Box corners are perfectly sharp, which reads as computer graphics.
  Real objects have a chamfer. Rounded boxes would fix it and cost geometry.

### Foil

- **improve** The specular is isotropic Blinn-Phong. Brushed metal is
  anisotropic: the highlight should smear along the brush direction rather than
  stay circular. The relief already knows its own direction, so the tangent is
  available and the change is contained.
- **improve** The rosette is the only shape. An option for a ring, a bar or a
  plain disc would make it usable as a foil-blocked logo surround rather than
  only as a seal.
- **watch** Nothing.

### Swell

- **improve** Instance colours are lerped in sRGB, which is why the crest reads
  as dusty pink rather than burnt orange. Lerping in OKLab would keep the
  saturation. three has the conversion.
- **improve** It has no `spacing` option. `count` changes both density and
  extent, so raising it also shrinks the forms, and the two effects fight.
- **watch** A compute-shader version under WebGPU could hold real wave
  propagation with history, which is the thing we gave up for determinism. Not
  until WebGPU is everywhere, and probably not even then, because the recorder
  still needs purity.

### Sort

- **improve** Splitting into spans defeats `text-wrap: balance` and
  `text-wrap: pretty` on the host, because the browser now balances inline-blocks
  rather than words. Worth measuring, and worth documenting either way.
- **improve** There is no way to reveal on a delay after the element appears. In
  practice everyone wants the heading to land after the hero has settled, and
  today that means wrapping `start()` in a `setTimeout`, which the runtime could
  do properly with a `delay` option.
- **watch** `::target-text` and CSS custom highlight ranges are not a substitute,
  but scroll-driven animations could drive the stagger without JavaScript once
  Firefox ships it unflagged.

### Riser

- **watch, significant** [CSS scroll-driven animations](https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Scroll-driven_animations)
  do exactly what Riser does, with no JavaScript, on the compositor.
  `animation-timeline: view()` plus a per-child `animation-delay` is the whole
  effect in about eight lines of CSS.

  It is Chrome 115+, Edge 115+ and Safari 18+, but as of Firefox 152 in June 2026
  it is still behind `layout.css.scroll-driven-animations.enabled` in stable.
  Global support is around 84%.

  **Recommendation:** do not replace Riser. Add the CSS-only version to its
  recipe as the better answer where you control the audience, and keep the
  JavaScript one as the answer that works everywhere. Being the library that
  tells you when you do not need it is worth more than one more item.
- **improve** The selection is taken once on the first frame. A `MutationObserver`
  would handle lists that arrive late, which is most lists.

### Tilt

- **improve** `mix-blend-mode: soft-light` on the sheen creates a stacking
  context and forces the panel onto its own compositing layer. On a grid of
  twenty cards that is twenty layers. A plain `opacity` gradient would be cheaper
  and only slightly worse.
- **improve** No gyroscope support. On a phone there is no cursor, so Tilt does
  nothing at all, and `deviceorientation` is the obvious answer. It needs a
  permission prompt on iOS, which is why most libraries skip it.

### Magnet

- **defect** `getBoundingClientRect` per frame, above.
- **improve** One window listener per instance. A shared listener with a registry
  would make a grid of them viable, and the recipe currently has to warn people
  off instead.

### Tally

- **improve** Cache the formatter, above.
- **improve** No integer-safe path. Above `Number.MAX_SAFE_INTEGER` the count
  silently loses precision. Unlikely, and cheap to guard.

### Contents

- **improve** `closedby="any"` gives `<dialog>` native light-dismiss. It is
  Chrome 134+ and part of Interop 2026. We hand-roll the backdrop click. Adding
  the attribute and keeping the handler as the fallback is strictly better.
- **improve** The recipe should say why this is a `<dialog>` and not the
  [Popover API](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Global_attributes/popover),
  which reached Baseline in April 2025 and is what most people will reach for
  now. The answer is that a popover does not make the rest of the page inert and
  does not trap focus, so for a full-screen index it is the wrong primitive. That
  is a question every reader will have and the recipe does not answer it.
- **improve** No `prefers-reduced-transparency` handling on the backdrop blur.

### Ember

- **improve** `color-mix` has no fallback, so on an older browser the hover state
  simply does not change. The note says this is a graceful loss. It is, but a
  `@supports` block with a hand-picked darker value costs four lines.
- **improve** No loading or pending state. Every real Get-prompt button needs
  one, and ours is the Get-prompt button.

---

## What to do next

In order of value for effort:

1. Cache the formatter and the colours. Half an hour, removes every per-frame
   allocation in the library.
2. Add `closedby="any"` to Contents and answer the Popover question in its
   recipe. An hour.
3. Add the CSS-only variant to Riser's recipe. An hour, and it is the most
   useful thing on this list to anybody reading the prompt.
4. Environment map on Sundial and Swell. Half a day, and it is the biggest
   visible improvement available.
5. Screenshot every reduced-motion frame in `pnpm review` and look at them. Two
   hours, and it closes the one accessibility promise made without evidence.

Sources: [MDN, scroll-driven animations](https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Scroll-driven_animations),
[MDN, popover attribute](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Global_attributes/popover),
[Codrops, building efficient three.js scenes](https://tympanus.net/codrops/2025/02/11/building-efficient-three-js-scenes-optimize-performance-while-maintaining-quality/),
[three.js forum on shadow performance](https://discourse.threejs.org/t/how-to-optimize-shadow-rendering-in-three-js-for-better-performance/64681).
