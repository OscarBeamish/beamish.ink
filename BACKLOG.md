# Backlog

All 171 items React Bits ships, mapped onto Beamish. Read `AGENTS.md` on the
licence boundary first: concepts are fair game, code is not. Every implementation
here is written from scratch, and anything recognisably derived from a specific
published demo gets a credit in its `meta.json`.

## Naming

Effects that touch type are named from typesetting and printing: a *sort* is one
piece of metal type, *pied* type is spilled and jumbled, an *impression* is the
pressure of the press, a *split fountain* is a gradient inked into one pass.
Backdrops borrow from paper and print finishing: marbling, watermark, guilloche,
stipple. This is the naming system. Keep using it.

Where a React Bits item only works on a near-black canvas, it is marked **recast**
and gets a paper-native equivalent rather than a port. Where it is a gimmick or
depends on their brand, it is marked **skip**.

## Priority

**P1** ships at launch. **P2** is the first wave after. **P3** is optional and
several of them may never be worth building.

Status: `done` items exist. Everything else is unbuilt.

---

## Type (32 candidates, 2 built)

Text treatments. Tier 1 where the effect takes an element containing text, which
keeps them framework-free and recordable. Tier 2 only where they need state.

| Beamish | React Bits | P | Note |
| --- | --- | --- | --- |
| Sort | Split Text | 1 | **done** |
| Focus | Blur Text | 1 | Blur resolves to sharp |
| Bleed | Fuzzy Text | 1 | Ink bleeding into paper fibres. Recast: theirs is a CRT wobble |
| Misprint | Glitch Text | 1 | Recast as a plate slipping, not RGB channel split |
| Impression | Text Pressure, Variable Proximity | 1 | Variable font weight under the cursor. Two of theirs, one of ours |
| Tally | Count Up | 1 | **done** |
| Fountain | Gradient Text | 2 | Split-fountain inking rather than an animated rainbow |
| Gloss | Shiny Text | 2 | Sheen sweep. Restrained: theirs reads as a discount code |
| Slug | Text Type | 2 | Typewriter. A slug is a cast line of type |
| Cipher | Decrypted Text, Scrambled Text | 2 | Two of theirs collapse into one |
| Pied | Falling Text | 2 | Pied type is spilled type. Needs no physics library |
| Flap | Split Flap Text | 2 | Departure board |
| Emboss | Depth Text | 2 | Recast: pressed into paper, not extruded in 3D |
| Outline | Stroke Text | 2 | |
| Curtain | Masked Heading | 2 | |
| Roundel | Circular Text | 2 | |
| Caret | Text Cursor | 3 | |
| Rota | Text Loop, Rotating Text | 3 | Two of theirs, one of ours |
| Shuffle | Shuffle | 3 | Close to Cipher. Build only if it reads differently |
| Loupe | True Focus | 3 | |
| Riser | Scroll Reveal, Scroll Float | 3 | Belongs in Reveals, not here |
| Skew | Scroll Velocity | 3 | |
| Pennant | Curved Loop | 3 | Text on an SVG path |
| Warp | Warp Text | 3 | |
| Fold | Fold Text | 3 | |
| Echo | Echo Text | 3 | |
| Pigment | Particle Text | 3 | Canvas particles from glyph pixels. Expensive |
| Teletype | ASCII Text | 3 | **recast** for paper, theirs is green-on-black |

## Backdrops (56 candidates, 3 built)

Ambient full-bleed scenes. This is the category most damaged by their
dark-canvas assumption, so most entries here are recasts rather than ports.

| Beamish | React Bits | P | Note |
| --- | --- | --- | --- |
| Overprint | Halftone Reveal, Dither | 1 | **done** |
| Sundial | nothing comparable | 1 | **done**. Real 3D is the thing they do not have |
| Marbling | Liquid Chrome, Ferrofluid | 1 | Paper marbling. Two of theirs, one of ours, and ours is paper-native |
| Guilloche | Waves, Line Waves, Sliced Waves | 1 | The engraved wave pattern on a banknote. Three of theirs, one of ours |
| Stipple | Dot Grid, Dot Field | 1 | |
| Contour | Topography | 1 | **done**, as a lit relief rather than a flat shader |
| Watermark | Silk | 2 | Light through paper. **recast** |
| Weft | Threads, Web Threads, Floating Lines | 2 | Woven fibre. Three of theirs, one of ours |
| Rake | Light Rays, Side Rays, Light Pillar, Lightfall, Beams | 2 | Raking light across a surface. Five of theirs, one of ours |
| Tooth | Noise, Grainient | 2 | Paper grain as the whole subject |
| Register | Grid Motion, Grid Scan, Register marks | 2 | Registration marks drifting |
| Moire | Grid Distortion, Ripple Grid | 2 | Two screens beating. Related to Overprint, must read differently |
| Prism | Prism, Prismatic Burst | 2 | |
| Bloom | Plasma, Plasma Wave, Aurora, Soft Aurora | 2 | **recast**. Four of theirs, one of ours |
| Dust | Particles, Pixel Snow, Galaxy | 2 | **recast** for paper. Three of theirs, one of ours |
| Vein | Lightning | 3 | **recast** as ink capillary spread |
| Foundry | Letter Glitch | 3 | A tray of type, not a Matrix screen |
| Bearings | Ballpit | 3 | Needs a physics solver. Expensive |
| Orb | Orb | 3 | |
| Cathode | Faulty Terminal, CRT Warp, Scanner, Radar | 3 | **skip** unless one earns it. Four dark-only CRT pieces |
| Shards | Aero Shards, Acid Squares, Shape Grid | 3 | |
| Tunnel | Light Tunnel, Hyperspeed | 3 | **skip**. Dark-only by definition |
| Blinds | Gradient Blinds, Color Bends | 3 | |
| Molten | Molten Metal, Evil Eye, Balatro, Dark Veil, Liquid Ether, Ghost Fibers, Iridescence, Pixel Blast, Gradient Waves | 3 | **skip**. Nine near-black shader backdrops with no paper reading |

## Pointer (38 candidates, 3 built)

| Beamish | React Bits | P | Note |
| --- | --- | --- | --- |
| Foil | Metallic Paint | 1 | **done** |
| Spark | Click Spark | 1 | Cheap, popular, and genuinely useful |
| Magnet | Magnet | 1 | **done** |
| Filings | Magnet Lines | 1 | Iron filings around a magnet |
| Trail | Image Trail, Pixel Trail | 1 | Two of theirs, one of ours |
| Splash | Splash Cursor | 2 | Fluid sim. The most expensive item in this table |
| Reticle | Target Cursor, Crosshair | 2 | |
| Comet | Blob Cursor, Ghost Cursor, Glow Cursor | 2 | Three of theirs, one of ours |
| Swarm | Swarm Cursor | 2 | |
| Peel | Sticker Peel | 2 | |
| Meniscus | Meta Balls | 2 | |
| Ripple | Ripple Distortion, Elastic Mesh | 3 | |
| Bokeh | Shape Blur | 3 | |
| Grid | Cursor Grid | 3 | |

## Reveals (candidates from Animations, 1 built)

How things arrive on screen.

| Beamish | React Bits | P | Note |
| --- | --- | --- | --- |
| Riser | Animated Content, Scroll Reveal, Scroll Float | 1 | **done** |
| Dissolve | Pixel Transition, Pixel Swap, Halftone Reveal | 1 | Halftone dissolve. Three of theirs, one of ours |
| Fade | Fade Content | 1 | Trivial, and its absence would be noticed |
| Haze | Gradual Blur | 2 | |
| Expand | Scroll Expand | 2 | |
| Curtain | Masked Heading | 2 | Shared with Type |

## Surfaces (from Components, 1 built)

Cards, panels, images.

| Beamish | React Bits | P | Note |
| --- | --- | --- | --- |
| Tilt | Tilted Card | 1 | **done** |
| Spotlight | Spotlight Card, Border Glow, Glare Hover | 1 | Three of theirs, one of ours |
| Contact | Chroma Grid | 1 | A contact sheet |
| Vellum | Glass Surface, Fluid Glass, Reflective Card, Glass Icons | 1 | **recast**. Translucent paper, not frosted glass. Four of theirs, one of ours |
| Mosaic | Pixel Card | 2 | |
| Deck | Card Swap, Stack, Bounce Cards, Flying Posters | 2 | Four of theirs, one of ours |
| Masonry | Masonry | 2 | |
| Sitter | Profile Card | 2 | Was going to be Plate. Plate is built, and it is the gallery |
| Bento | Magic Bento | 2 | |
| Folder | Folder | 3 | |
| Decay | Decay Card | 3 | |
| Rolodex | Circular Gallery, Dome Gallery, Infinite Spiral, Depth Carousel, Carousel, Morph Slider | 3 | Six of theirs. ImageGalleryLightbox covers the flat case and ScrollSlideshow the scroll-run one, so this is only worth it for the curved one |
| Viewer | Model Viewer, Lanyard | 3 | Real 3D. Worth doing well or not at all |

## Navigation (from Components, 2 built)

| Beamish | React Bits | P | Note |
| --- | --- | --- | --- |
| Contents | Staggered Menu, Infinite Menu, Flowing Menu | 1 | **done** |
| Ember | Specular Button, Star Border | 1 | **done** |
| Rail | Line Sidebar, Dock | 1 | |
| Gutter | Card Nav, Pill Nav, Bubble Menu, Gooey Nav | 2 | Four of theirs, one of ours |
| Stepper | Stepper | 2 | |
| Ledger | Animated List, Scroll Stack | 2 | |
| Odometer | Counter | 2 | |
| Dial | Option Wheel, Elastic Slider, Curved Input | 3 | Three of theirs, one of ours |
| Halo | Electric Border, Filament | 3 | |

---

## Codrops

A different source and a different licence. Codrops demos are plain MIT, not MIT
plus Commons Clause, so adapting their code with the copyright notice retained
would be legal. We are still writing from scratch, because a file carrying a
third-party notice complicates the one thing every prompt promises: this is your
code, in your repo, with nothing to update. Concepts and credit only, same as
everywhere else.

The reason to mine Codrops is that it is almost entirely real 3D, which is the
one axis React Bits has nothing on. Their WebGL entries are full-bleed 2D
backdrops. Codrops publishes cameras, meshes, depth maps and physics every week.

| Beamish | Source | P | Note |
| --- | --- | --- | --- |
| Loupe | Mouse-Following Square Lens, Tomoyuki Nakata, Aug 2026 | 1 | Lens distortion and chromatic shift inside a shape that tracks the cursor. **Recast**: a magnifier over letterpress rather than a neon square. Merges with True Focus from the React Bits list |
| Relight | Relighting Images with Depth Maps, Aug 2026 | 1 | A flat photograph plus a depth map, lit by a lamp that moves. Nothing in React Bits comes close, and it lands on paper without changing anything |
| Swell | Interactive Wave Propagation Cube Grid, Jul 2026 | 1 | **done** |
| Threshold | Persistent Page Transitions with WebGPU, Jun 2026 | 2 | Page transitions with a scene that survives navigation. **Recast** to WebGL2: WebGPU is Chrome-only for our purposes |
| Teletype | Shape-Aware ASCII Renderer, Sep 2026 | 2 | Every cell picks the glyph whose shape fits, not the one whose brightness matches. Far better than the usual luminance ramp. **Recast**: ink on paper, not green on black |
| Vellum | Infinite Liquid Glass Grid, Sep 2026 | 2 | **done**. Their glass became our translucent paper, and the multiply blend turned out to be the whole design |
| Facet | Procedural Geometry with Three.js and WebGPU, Aug 2026 | 3 | Surface picking and live procedural geometry. WebGPU, so it waits |
| Vitrine | Scroll-Driven 3D Gallery on a Blender Camera Path, Jul 2026 | 3 | Needs an authored camera path and a model, which is a different kind of maintenance |
| skip | Real-Time Datamosh, Sep 2026 | 3 | **skip**. Codec glitch aesthetics, dark by nature, and nothing to do with paper |
| skip | Real-Time 3D Face Mask with MediaPipe, Sep 2026 | 3 | **skip**. Needs a camera permission and a 3MB model |

Credit goes in the effect's `meta.json` and on its page, naming the author and
linking the article.

### The 3D shortlist, sharpened

Swell proved the pattern: a three.js scene in the Sundial family costs about half
a day and is the one thing React Bits cannot answer. Three scenes now exist in
two shapes, a still life and a field. These are the next three, in order.

**Contour** is done. Codrops' Ridgeline piece is real-time terrain, and a
topographic relief is the most paper-native 3D subject there is: contour lines
are a printing convention, the surface is matte, and it lights exactly like
Sundial. It needs no assets, no WebGPU and no model loader, which is what
disqualified the other candidates. It is also a third distinct shape after the
still life and the field, so it stretches the runtime rather than repeating it.

Promote it out of Backdrops. As a 2D shader it was a P1 nobody would have
noticed; as a lit relief it is a headline item.

**Vellum** is done. Their glass is faked entirely in the shader with no
refraction pass, which was the technique worth taking, and translucent paper
wanted the same trick for the same nothing. What was not obvious in advance is
that multiplying rather than compositing makes the blend order-independent,
which is what let the whole pile live in one InstancedMesh. That is the reusable
finding, not the paper.

**Vitrine** third, and only if a scroll-driven 3D gallery earns its keep. It
needs an authored camera path, which is a different kind of maintenance from
everything else here.

Two more stay out. The face-mask piece needs a camera permission and a 3MB
model. Anything built on TSL or WebGPU waits until WebGPU is not Chrome-first,
because a prompt that only works in one browser is not a prompt worth pasting.

One technique from their wave-grid article we deliberately did not take:
raycasting the pointer into the scene. Swell maps the pointer straight onto grid
coordinates instead. It is simpler, it has no per-frame raycast, and it keeps
`renderAtTime` pure. Use the same approach in Contour.

---

## What the numbers actually are

171 React Bits items collapse to roughly 90 of ours, because they ship four cursor
glows and five light-ray backdrops as separate entries and we would not.

Codrops adds eight more worth building, three of them P1 and all of them 3D.

Of the React Bits 90: 25 are P1, about 30 are P2, and the rest are P3 or marked skip.

Twelve are built. At the rate of the first session, a good item costs most of a
day once you count the shader, the option surface, the recipe, the recording and
the paste-test. Twenty-five P1 items is therefore several weeks, not a sitting.

The brief this project started from says twelve genuinely beautiful things beat
forty adequate ones, and that we lose on breadth against a library with 45,000
stars and weekly additions. Both are still true. The reason to work through this
list is that the concepts are proven and the audience already searches for them,
not that matching 171 is the goal.
