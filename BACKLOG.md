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

## Type (32 candidates, 1 built)

Text treatments. Tier 1 where the effect takes an element containing text, which
keeps them framework-free and recordable. Tier 2 only where they need state.

| Beamish | React Bits | P | Note |
| --- | --- | --- | --- |
| Sort | Split Text | 1 | **done** |
| Focus | Blur Text | 1 | Blur resolves to sharp |
| Bleed | Fuzzy Text | 1 | Ink bleeding into paper fibres. Recast: theirs is a CRT wobble |
| Misprint | Glitch Text | 1 | Recast as a plate slipping, not RGB channel split |
| Impression | Text Pressure, Variable Proximity | 1 | Variable font weight under the cursor. Two of theirs, one of ours |
| Tally | Count Up | 1 | Animated number. Needs `Intl.NumberFormat`, not string padding |
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

## Backdrops (56 candidates, 2 built)

Ambient full-bleed scenes. This is the category most damaged by their
dark-canvas assumption, so most entries here are recasts rather than ports.

| Beamish | React Bits | P | Note |
| --- | --- | --- | --- |
| Overprint | Halftone Reveal, Dither | 1 | **done** |
| Sundial | nothing comparable | 1 | **done**. Real 3D is the thing they do not have |
| Marbling | Liquid Chrome, Ferrofluid | 1 | Paper marbling. Two of theirs, one of ours, and ours is paper-native |
| Guilloche | Waves, Line Waves, Sliced Waves | 1 | The engraved wave pattern on a banknote. Three of theirs, one of ours |
| Stipple | Dot Grid, Dot Field | 1 | |
| Contour | Topography | 1 | |
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

## Pointer (38 candidates, 1 built)

| Beamish | React Bits | P | Note |
| --- | --- | --- | --- |
| Foil | Metallic Paint | 1 | **done** |
| Spark | Click Spark | 1 | Cheap, popular, and genuinely useful |
| Magnet | Magnet | 1 | |
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
| Plate | Profile Card | 2 | |
| Bento | Magic Bento | 2 | |
| Folder | Folder | 3 | |
| Decay | Decay Card | 3 | |
| Rolodex | Circular Gallery, Dome Gallery, Infinite Spiral, Depth Carousel, Carousel, Morph Slider | 3 | Six of theirs, one or two of ours |
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

## What the numbers actually are

171 of theirs collapse to roughly 90 of ours, because they ship four cursor
glows and five light-ray backdrops as separate entries and we would not.

Of those 90: 25 are P1, about 30 are P2, and the rest are P3 or marked skip.

Eight are built. At the rate of the first session, a good item costs most of a
day once you count the shader, the option surface, the recipe, the recording and
the paste-test. Twenty-five P1 items is therefore several weeks, not a sitting.

The brief this project started from says twelve genuinely beautiful things beat
forty adequate ones, and that we lose on breadth against a library with 45,000
stars and weekly additions. Both are still true. The reason to work through this
list is that the concepts are proven and the audience already searches for them,
not that matching 171 is the goal.
