<!--
  The brief this page was built from, kept verbatim.

  Named brief.md, because prompt.md means something else here: that is
  the generated Beamish prompt, written into .generated/<slug>/.

  Written by Ray Velez for instalanding.ai and distributed with the page
  under the MIT licence.
-->

Build a single-file HTML landing page for "Murmur Labs", a fictional applied AI research lab whose product is a multi-agent platform called Swarm. Two ideas carry the whole page: a hero made of a hundred soft spheres you can push around, and every card on the page cut out to look like a holographic admission ticket. Oswald from Google Fonts, three.js r128 and GSAP + ScrollTrigger from a CDN, everything else inline. No image files and NO ICON FONT - draw the four social marks as inline SVG, because pulling a hundred kilobytes of icon CSS plus a woff2 for four glyphs is the one asset this page does not need. Say in the footer that the lab, the platform, the models and every figure are invented.

THE PALETTE
Cool paper and one dusty rose family, nothing else: --paper #fbfaff, --black #101117, --petal #f2c4c4, --albedo #c7a5a5, --rose #b76e79, and a single --gold-grad of #f7dccf to #dca79c to #b76e79 at 135deg. The gold gradient is the only accent: it fills the word-mark text clip, the button wipe, the rule that draws across a process step on hover, and the footer social hovers. Give the body a very slight left-to-right wash toward #ecf0fb so the page is not flat white.

THE HERO - A SWARM OF AGENTS
About a hundred spheres in one three.js group, hand-placed in three clusters (a dense core, a left wing, a right wing) with radii from 0.15 to 1. MeshLambertMaterial in --albedo with a red emissive, one ambient light, one spotlight high and to the right, one weak directional from below. The camera is a 25deg perspective at z 24.

- On load they fly in: every sphere starts 25 units below, and a GSAP timeline per sphere staggered by 0.02s arcs it up, overshoots, and settles on its own position, pushing z out and back with a sine of the tween progress so the arc has depth. Until that finishes the page chrome is at opacity 0 and a single huge word sits behind the cluster; when it finishes the chrome fades in and the word fades out.
- After that they breathe: every frame each sphere lerps at 0.018 toward its original position plus a small sine on y and cosine on z, offset by index so the cluster undulates rather than pulsing as one.
- Hovering pushes them. Raycast on mousemove, take the first hit, and store a force vector along the hit normal that is applied and damped by 0.95 each frame until it is negligible. Then resolve collisions pairwise: if two spheres are closer than 1.2x the sum of their radii, push both apart along the line between them. That pairwise pass is O(n squared) on a hundred spheres, which is fine at this count and is the reason not to raise it much.
- Three things to get right or the page fights the reader. Attach OrbitControls but turn OFF zoom and pan, or the wheel stops scrolling the page. On coarse pointers disable the controls entirely and set touch-action pan-y on the canvas, or the hero traps the first swipe. And gate the whole rAF behind an IntersectionObserver on the hero, because there is no reason to raycast and resolve ten thousand sphere pairs for a section nobody is looking at.
- Only push while the pointer is actually over the hero: compare clientY against the canvas rect, since the mousemove listener is on window.

THE TICKET - one mask recipe, used five ways
Every card is a die-cut ticket, and the die is a CSS mask rather than a background image. The paper is a conic-gradient of eight or ten pale iridescent stops over a soft vertical wash, with a second layer of repeating-radial rings in color-burn at low opacity drifting on a nine-second alternate loop, and a cursor-tracking radial white sheen in soft-light. Then cut it:

- Build the shape out of four mask layers composited with INTERSECT, not add: two repeating radial gradients along opposite edges for the perforations, and two single radial gradients for the notches where the stub tears off. Add would union the holes and you would get a rectangle back. Write both the -webkit-mask-composite: source-in and the standard mask-composite: intersect - they are different keywords for the same result and Chromium still wants the prefixed one.
- Keep the vertical and horizontal recipes in two custom properties on the same element, --mask-v and --mask-h, and switch between them by reassigning mask. The wide CTA ticket uses --mask-h; at narrow widths it flips back to --mask-v when the layout stacks, and the only thing that changes is which variable is assigned.
- The perforated edge is the mask, but the TEAR line is a separate dashed border inset by the notch radius, and the notch positions are driven off the same --stub variable the stub height uses, so the notches always sit exactly where the tear is.
- Float them: a 4.5s ease-in-out translate loop with animation-delay set from a per-card --i so they do not bob in unison. Use the individual translate property, not transform, because the pointer tilt writes transform and two owners of one property is how a card ends up stuck mid-air.
- On pointermove write a perspective rotateX/rotateY from the cursor position and set --mx/--my for the sheen; reset both on pointerleave. Guard it behind pointer: fine.

THE FIVE USES

1. A marquee strip: the ticket mask stretched across a rotated band, two copies of six words translating -50% on a linear loop, with a slow light sweep in soft-light over the top and the whole track pausing on hover.
2. Six product cards in a three-column grid, every second one dropped 90px, each holding a little constellation of CSS radial-gradient orbs that drift apart on hover.
3. Six model cards in a flex row that expand on hover - flex 1 to flex 2.4 - revealing a description and a barcode that were collapsed to zero height and width. Below 1200px this has to become a grid with everything already open, because a hover-to-expand row is unusable the moment hovering stops being a thing.
4. A wide admission ticket for the CTA, stub on the right, with a barcode scaled 1.6x on its x axis.
5. One dark variant for the embeddings model, which needs its own holographic stops, an inverted barcode and a screen blend instead of color-burn.
   Draw the barcode with a single pseudo-element and a long box-shadow list rather than twenty spans.

TYPE AND SECTIONS
Oswald throughout, 200 to 700. A 160px hero numeral, 104px section titles, a 132px CTA headline with one word in -webkit-text-stroke outline. Sections are numbered 02 to 06 with an uppercase label and a rule. Between them: a statement paragraph with three stats, a four-step process row where a gold rule draws across the top border on hover, and a centred 68px quote. The footer ends with the word-mark at 19.5vw, the disclaimer, and a three-part bottom bar.

RESPONSIVE AND MOTION
Breakpoints at 1499, 1199, 991, 767. The work grid goes 3 to 2 to 1, the process grid 4 to 2 to 1, the model row to a 3-up then 2-up then 1-up grid with everything expanded, and the wide CTA ticket stacks with its stub underneath. Hide the hero nav under 767 and leave the hamburger. No horizontal scroll at 390 - the marquee band is deliberately wider than the viewport, so the overflow has to be clipped on html and body, not just on the band. Under prefers-reduced-motion drop the ticket float, the holographic drift and the marquee sweep.
