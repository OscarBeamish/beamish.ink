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

Where an item is a gimmick or depends on their brand, it is marked **skip**.

**The dark-canvas skips are reopened.** This file was written when paper was
read as a rule about what could be built, so anything that only worked on a
near-black canvas was either recast into something paper-native or dropped
outright. That cost the library a whole shelf: `Molten` alone swallowed nine
entries on those grounds, and `Tunnel` and `Cathode` went the same way. Paper is
the house style and not a limit, so a dark-ground item is a legitimate item. It
declares `ground: "dark"` in its `meta.json`, tunes its defaults for its own
ground, and ships a demo plate that is not the site's paper. See `AGENTS.md`.

A **recast** is still often the better idea, but it is now a design decision
rather than a requirement. Recast when the paper version is the more interesting
object. Port when the thing itself is the point and a paper version would be a
worse version of it.

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
| Focus | Blur Text | 1 | **covered**. ScrambleText already has a `blur` option that resolves to sharp. Building this would be a second name for an option that exists |
| InkBleedText | Fuzzy Text | 1 | **done**. An SVG displacement filter, so the edge grows teeth rather than blurring. A blur is a lens out of focus, not ink spreading |
| MisprintText | Glitch Text | 1 | **done**. A plate out of register, multiplied, so the overlap darkens. A channel split brightens, which is light rather than ink |
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
| HalftoneMagnifier | True Focus | 3 | **covered** by the Codrops HalftoneMagnifier |
| Riser | Scroll Reveal, Scroll Float | 3 | Belongs in Reveals, not here |
| Skew | Scroll Velocity | 3 | |
| Pennant | Curved Loop | 3 | Text on an SVG path |
| Warp | Warp Text | 3 | |
| Fold | Fold Text | 3 | |
| Echo | Echo Text | 3 | |
| Pigment | Particle Text | 3 | Canvas particles from glyph pixels. Expensive |
| Teletype | ASCII Text | 3 | **recast** for paper, theirs is green-on-black |

## Backdrops (56 candidates, 7 built)

Ambient full-bleed scenes, and the category where the old dark-canvas rule did
the most damage: the entries below marked skip were skipped for being dark
rather than for being bad, and they are the striking ones. They are open again.

A backdrop still has to survive being ignored, whatever ground it is on. Dark
does not mean busy, and the measured limits in `AGENTS.md` apply to a night sky
exactly as they do to a sheet of paper.

| Beamish | React Bits | P | Note |
| --- | --- | --- | --- |
| Overprint | Halftone Reveal, Dither | 1 | **done** |
| Sundial | nothing comparable | 1 | **done**. Real 3D is the thing they do not have |
| MarbledPaper | Liquid Chrome, Ferrofluid | 1 | **done**. Real marbling: every tray operation has a closed-form inverse, so each pixel runs the session backwards |
| Guilloche | Waves, Line Waves, Sliced Waves | 1 | The engraved wave pattern on a banknote. Three of theirs, one of ours |
| StippleField | Dot Grid, Dot Field | 1 | **done**. Tone is the number of marks, not their size, which is what separates a stipple from a halftone |
| Contour | Topography | 1 | **done**, as a lit relief rather than a flat shader |
| WatermarkSheet | Silk | 2 | **done**. Laid lines, chain lines, formation and a wire device. Everything lightens, because everything is somewhere the sheet is thinner |
| Weft | Threads, Web Threads, Floating Lines | 2 | Woven fibre. Three of theirs, one of ours |
| Rake | Light Rays, Side Rays, Light Pillar, Lightfall, Beams | 2 | Raking light across a surface. Five of theirs, one of ours |
| Tooth | Noise, Grainient | 2 | Paper grain as the whole subject |
| Register | Grid Motion, Grid Scan, Register marks | 2 | Registration marks drifting |
| Moire | Grid Distortion, Ripple Grid | 2 | Two screens beating. Related to Overprint, must read differently |
| Prism | Prism, Prismatic Burst | 2 | |
| Bloom | Plasma, Plasma Wave, Aurora, Soft Aurora | 1 | Aurora over a dark sky. Four of theirs, one of ours. Was a recast because of the paper rule; it is the thing itself now |
| Dust | Particles, Pixel Snow, Galaxy | 2 | Three of theirs, one of ours. Paper version is fine; a dark one is now allowed and is the better object |
| Vein | Lightning | 2 | Capillary spread on paper, or the strike itself on dark. Both are worth one item each, if either earns it |
| Foundry | Letter Glitch | 3 | A tray of type, not a Matrix screen |
| Bearings | Ballpit | 3 | Needs a physics solver. Expensive |
| Orb | Orb | 3 | |
| Cathode | Faulty Terminal, CRT Warp, Scanner, Radar | 3 | Four dark-only CRT pieces. Reopened, but a phosphor screen is a costume rather than a material: build one only if it has something to say |
| Shards | Aero Shards, Acid Squares, Shape Grid | 3 | |
| Tunnel | Light Tunnel, Hyperspeed | 3 | Dark by definition, which is no longer a reason to skip it. Hard to keep quiet enough for a backdrop: this one is a hero, not a page background |
| Blinds | Gradient Blinds, Color Bends | 3 | |
| Molten | Molten Metal, Evil Eye, Balatro, Dark Veil, Liquid Ether, Ghost Fibers, Iridescence, Pixel Blast, Gradient Waves | 1 | Nine of theirs, one of ours, and the largest single gap in the library. Iridescent metal under a slow light: thin-film interference rather than a rainbow ramp, which is the same physics as the dispersion in the glass items |

## Pointer (38 candidates, 3 built)

| Beamish | React Bits | P | Note |
| --- | --- | --- | --- |
| Foil | Metallic Paint | 1 | **done** |
| Spark | Click Spark | 1 | Cheap, popular, and genuinely useful |
| Magnet | Magnet | 1 | **done** |
| PointerFilings | Magnet Lines | 1 | **done**. The real dipole expression, so the field loops rather than radiating |
| PointerSmoke | Image Trail, Pixel Trail | 1 | **done**. Puffs that get wider and fainter with age, which is smoke spreading rather than a particle dying. Shipped as PointerTrail and renamed, because it was never reading as ink |
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
| HalftoneReveal | Pixel Transition, Pixel Swap, Halftone Reveal | 1 | **done**. The dots grow rather than the opacity rising, which is how a halftone carries tone in the first place |
| Fade | Fade Content | 1 | **covered**. ScrambleText with split line, rise 0 and blur 0 is a plain fade, and ScrollRevealRows covers the scroll-triggered one |
| Haze | Gradual Blur | 2 | |
| Expand | Scroll Expand | 2 | |
| Curtain | Masked Heading | 2 | Shared with Type |

## Surfaces (from Components, 1 built)

Cards, panels, images.

| Beamish | React Bits | P | Note |
| --- | --- | --- | --- |
| Tilt | Tilted Card | 1 | **done** |
| SpotlightCard | Spotlight Card, Border Glow, Glare Hover | 1 | **done**. Light and shade, because a pale card lifted a few percent is still a pale card |
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
| HalftoneMagnifier | Mouse-Following Square Lens, Tomoyuki Nakata, Aug 2026 | 1 | **done**. Recast completely: a printer's glass, so what the magnification reveals is the halftone rosette the picture is actually made of. The lens distortion and the lateral colour are still there, holding up a round barrel rather than a neon square |
| RelightImage | Relighting Images with Depth Maps, Aug 2026 | 1 | **done**, without the depth map. It lights the print rather than the scene: height is the picture's own luminance, so what the lamp finds is relief in the sheet. Nothing to author and nothing extra to ship |
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
