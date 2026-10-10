<!--
  The brief this page was built from, kept verbatim.

  Named brief.md, because prompt.md means something else here: that is
  the generated Beamish prompt, written into .generated/<slug>/.

  Written by Ray Velez for instalanding.ai and distributed with the page
  under the MIT licence.
-->

Build a single-file HTML landing page for "Traffo", a fictional product analytics platform. Plus Jakarta Sans, Manrope and JetBrains Mono from Google Fonts; GSAP 3.12 with ScrollTrigger from a CDN. Every graphic is inline SVG — no image requests.

DESIGN SYSTEM
Warm paper #f6f3eb with a second tone #ecead4 for the lower half, ink #0f0f0f, soft ink #5a5a55. Three clay colours, each a three-stop family: mint #dcf5dc / #c8ecc8 / #95c598, acid yellow #f1ff76 / #e5ff00 / #b9cc00, purple #ece2f8 / #dcd0ee / #ab9bd0, plus a black tile at #3a3a3a → #050505. The acid comes from the button and is then used everywhere — tiles, stat suffixes, ambient orbs — so the page reads as one system rather than a button dropped onto a palette. Every clay surface uses the same recipe — a 165° gradient through all three stops, an inset white top edge, an inset dark bottom edge, an inset 30px inner glow, then a coloured ambient shadow and a wide soft one. Radius 36px on tiles and cards, 48px on big slabs. Plus Jakarta Sans 700 at -0.035em for display, Manrope for body, JetBrains Mono 11px at 0.14–0.18em for labels. Springs are cubic-bezier(.34,1.56,.64,1). A fixed SVG turbulence grain sits over the page at 10% multiply, with two blurred colour orbs behind it.

THE CONSTELLATION (the centrepiece)
A 600×660 field holding eleven clay tiles at absolute pixel positions — three sizes: 142×118 main, 156×132 for the black database at the centre, 64×64 circular pills — each with a line-art icon at 50% of the tile. Behind them, an SVG at the same 600×660 viewBox draws twelve curved paths connecting the tiles, stroked at 1.6px in 85% ink.
Build each tile as three nested layers, one owner per transform, or they will fight:

- `.tile` — position, and the GSAP entrance (opacity + elastic scale).
- `.tile-float` — a CSS keyframe drifting -6 to -12px on its own duration and delay per tile.
- `.tile-inner` — the hover lift (translateY(-10px) scale(1.06)), with the icon scaling and rotating -4°.
  Put the float on `.tile` itself and the entrance tween writes the same `transform`; the elastic pop is what loses. And end that entrance tween with `clearProps: "transform"`, or the inline matrix GSAP leaves behind pins every tile and the float never starts.
  The whole cluster tilts in 3D toward the pointer: rotationY ±12°, rotationX ±8°, `transformPerspective: 1500`, springing back with `elastic.out(1, .5)` on leave. Tilt an inner wrapper, not the element the scroll tween moves.

ENTRANCE
One GSAP timeline: header fades, the three headline lines slide up out of `overflow: hidden` masks, the description and CTA rise, the tiles pop in staggered `from: "center"` with `elastic.out(1, .6)`, the twelve lines draw themselves via stroke-dashoffset, then the workspace bar and its pills. Keep the initial hidden states in JS, not CSS — if the script fails to load, the page should still render complete rather than blank.

THE BUTTON — AND THE SYSTEM IT SETS
An acid-yellow pill that sits inside a measuring frame: four dashed guides and four corner dots that draw themselves in around it on hover, like a dimension being marked on a drawing. Give it six tokens and let the rest of the page pull from them: --dot-size 6px, --line-weight 1px, --line-distance .9rem 1.1rem, --animation-speed .35s, --dot-color #666, --line-color #999.

- The pill's radius is a percentage squish, not a pixel value: 30% / 200% at rest, 10% / 200% on hover, 20% / 200% on :active. That is what makes it read as a soft capsule that firms up when you reach for it. It also scales 1.05 on hover and 0.98 on press, and goes white on hover so the yellow reads as the resting state.
- Six-stop shadow stack from 0 0 0 1px #0003 down to 0 32px 24px rgba(3,7,18,.1) — the whole lift is in the shadow, not a transform.
- The dots are absolutely positioned behind the button and fly to the corners in sequence (0, 0.6, 1.2, 1.8 × --animation-speed). The guides then draw in at 0.8, 1.4, 2, 2.4 ×, each starting rotated 5° and scaled to 0 on the axis it will grow along, so they swing straight as they extend. Build the dashes from a repeating-linear-gradient rather than border-style: dashed, so the rhythm stays tied to --line-weight.
- After all of it, the wrapper washes to #e5ff0055 — an 80%-to-100% keyframe, so the wash only lands once the frame is complete.
- Arm it with .btn-wrapper:has(.btn:hover) so only the button itself starts the sequence, AND with :focus-within, or a keyboard user never sees the frame. Mark every dot and line aria-hidden — they are eight empty divs.
- Two things to fix from the usual version of this component: the label at #0008 on #e5ff00 is about 4.2:1, under AA for 16px semibold, so darken it to rgba(0,0,0,.82) — that measures 12.55:1; and on a dark slab the #999 / #666 guides vanish, so re-point --line-color and --dot-color on that section instead of rewriting the rules.
- Reuse the frame as a card treatment: the same dashed guides and corner dots, drawn with background gradients on ::before and ::after, fading in on hover with the dots delayed behind the lines.

SECTIONS

1. Header: cube logo in inline SVG, text nav, and the same button at a small size.
2. Hero: 1fr / 1.15fr split, headline at clamp(48px, 5.8vw, 84px), and the button below.
3. Workspace bar: three clay pills that lift and rotate -3° on hover.
4. Stats: four counters on the warm tone with a 48px top radius. Drive each from data attributes — `data-num`, `data-decimals`, `data-prefix`, `data-suffix` — and render prefix + value + a coloured suffix span. Do not derive the format from the magnitude at runtime: that is how 2400 with an "M" suffix renders as "2.4kM".
5. Features: a mono eyebrow with a rule, a split heading, a right-aligned mono meta block, and three clay cards that tilt in 3D toward the pointer. GSAP owns the card transform, so do not also give it a CSS hover transform.
6. Quote: an oversized quote mark that springs in, and a 64px statement.
7. Final CTA: a black slab with two blurred orbs and a yellow CTA.
8. Footer: brand, three link columns, a mono bottom bar.

WORD REVEALS
Split the section headings into per-word masks and slide them up on scroll. Split by walking TEXT NODES, not `innerText.split(" ")` — flattening the heading destroys inner markup like an accent span, and then the colour has to be guessed back by matching words.

CURSOR
Leave the pointer alone. A dot that replaces the caret is the first thing anyone notices and the first thing they ask you to take off: it reads as a circle following the mouse rather than as a cursor, it costs the operating system's own hover and text affordances, and it has to be gated on pointerType, handed back on the first touch, and propped up with focus rings — a lot of machinery to end up worse off than the arrow you started with.

RESPONSIVE
At 1100px the hero stacks and the cards go to one column. Below 700px hide the nav and scale the constellation — scale a WRAPPER, because GSAP writes an inline transform on the field during the scroll parallax and an inline style beats a media query. Remember a transform scales pixels but not the layout box: pair the scale with negative margins (600×(1-s)/2 each side, 660×(1-s) at the bottom) or the field keeps reserving 600×660 and the page overflows. `prefers-reduced-motion` skips the timeline, the floats, the tilts and the counters, rendering every final state immediately.

THE SLAB — claymorphism carrying glassmorphism
Set the whole hero on one slab of white clay inset from the page edges: a soft body, a warm cast underneath it, an inset lip along the bottom edge so the surface reads as thick, and a single acid band cut diagonally across one corner. The clay recipe calls for a COLOURED cast rather than a grey one and with a high-chroma accent that is a trap — tinted at full strength it comes back as a halo ringing the whole slab, which reads as a glow rather than as a shadow. Keep the cast and the lip warm-neutral and let the accent do its work where it is meant to: the band, the underline and the button.
Then straddle its edges with two frosted chips - a labelled tab hanging off the top-left, a disc over the bottom-right - each a wash of white at about 40%, a backdrop blur, a coloured drop shadow and an inset lip. The straddle is the entire reason to pair the two styles: a backdrop-filter has nothing to say sitting on flat colour and everything to say when half the chip is over the slab and half over the paper, so one piece of glass shows two blurs at once. Prove it is doing something rather than assuming - screenshot the chip with the filter on and off and compare, because a frosted panel that is only a pale fill looks convincing and is not glass.
Percentages of a gradient axis do not survive a change of scale. The band at 85-91% that clips the corner of a 400x250 card puts a 60px stripe 700px into the face of a 1450x860 slab, straight through the artwork; the same look wants 93-97% here.
Same trap on the sticker line. White letters held together by nothing but a coloured drop shadow work at 34pt and ghost at 84px, where the outline is too small a fraction of the letter to read - give it a real stroke to do the holding and let the accent do the depth, and loosen the tracking, because a stroke that wide closes the gaps between letters at display tracking.
A chip that hangs into the slab needs somewhere for the headline to start that is not underneath it: add the top padding back at narrow widths.

THE THEME AND THE BAR
Warm grey ground at #ebe9e1, cream cards, near-black ink and ONE yellow at #fde351. Do not reach for an acid yellow here: it is a signal colour, it reads as a highlighter wherever it lands, and any shadow tinted with it turns into a glow. The warmer yellow does the same jobs — fills a button, backs a word, cuts a band — without shouting over the type. Funnel Display throughout, and give the headline its 800 weight at -0.045em, because a humanist sans with a chunky black wants the tracking pulled harder than a neutral grotesk would.
The bar is a black pill floating on the paper, fixed to the top, with a yellow rule running the full width above it. Its relief is a moulding, not a glow: a lit top edge, a dark inner foot, a hard bottom lip and two spreads of neutral cast. The nav links live inside it as pills that fill on hover, and its call to action is a yellow pill inside the black one — the measuring frame that wraps the hero's button belongs on paper, since dashed guides and corner dots simply disappear on black.
Fixing the bar takes the page's top spacing with it. Leave room for the rule, the pill AND anything that hangs off the top of the first block — a glass tab straddling the slab's corner needs its own clearance, and clearing the pill alone drops the tab straight onto it.
One thing to re-check after a palette swap: any button shaded with a flat black overlay. A 25% black over an acid yellow reads as a soft shade; over a warm one it reads as mud. Shade with the theme's own three-stop ramp instead.
