<!--
  The brief this page was built from, kept verbatim.

  Named brief.md, because prompt.md means something else here: that is
  the generated Beamish prompt, written into .generated/<slug>/.

  Written by Ray Velez for instalanding.ai and distributed with the page
  under the MIT licence.
-->

Build a single-file HTML landing page for "SmartCare Solutions", a clinical AI platform, whose entire design system is one CSS control: a round power switch that lights up when it is on. Inter Tight from Google Fonts, GSAP 3.12 + ScrollTrigger from a CDN, everything else inline — every illustration, avatar and icon is inline SVG, and no asset is hotlinked.

BUILD THE SWITCH FIRST; EVERYTHING ELSE IS IT, RESIZED
A hidden checkbox, a circular label, an icon inside it.
- Unlit: a dark fill, a 2px grey rim, and `box-shadow: 0 0 3px rgb(2,2,2) inset` so the face sits below the surface. The icon's path is filled grey — fill, not stroke, so the glow has something solid to bloom off.
- Lit (`input:checked + .switch`): the rim goes white, the fill turns pale teal, and one shadow list does all the work — `0 0 1px`, `0 0 2px` and `0 0 10px` of rgb(151,243,255) inset, then `0 0 40px` and `0 0 100px` of it outside, then a `0 0 5px` rim. The icon gets `filter: drop-shadow(0 0 5px)` in the same cyan and a white fill.
- Put the size in a variable so the same control is a 70px power button or a 48px chip.
Then scale that recipe into the pill CTAs: idle keeps the dark inset, and hover, focus-within and a permanent `is-live` class all share one lit state built from the same stack. Soften only the two widest blooms to rgba there — at 40px and 100px of solid cyan a 300px pill lights the whole section instead of itself — and on any backdrop-filtered surface drop them entirely, since the filter's own layer clips them.
Because it is CSS, the button has no JS, no runtime and no loading state; the page renders lit with scripting off.

THE HERO'S LIGHT SOURCE
Behind the hero runs an iridescence shader, in plain WebGL in a script tag — no framework, no npm, no ogl. One full-screen triangle, one fragment shader: eight iterations where `a` feeds `d` and `d` feeds `a` (`a += cos(i - d - a * uv.x); d += sin(uv.y * i + a);`), then the result cosine-folded twice into RGB. That mutual feedback is what makes the bands fold into each other like oil on water instead of drifting in parallel.
Fit it to the page instead of dropping it on top: uColor multiplies the final sweep, so it is the palette knob — set it to the page's indigo (0.42, 0.46, 1.0) and the whole thing lands on this palette. Screen-blend the canvas so the dark board shows through rather than being covered, and mask it to an ellipse so it reads as a glow with an origin rather than a rectangle. The pointer moves the field through uMouse, smoothed at 0.06 — never by transforming the canvas, which would drag the mask along with it. Cap DPR at 1.5, pause when the hero scrolls out or the tab hides, and under reduced motion draw one settled frame and stop. No context: fall back to three blurred radial gradients in the same three hues.

ONE LIGHT, EVERYWHERE (the synthesis)
The shader sweeps cyan → blue → violet → magenta. Name that sweep once as a token and cut everything else from it, so the page has a single light source rather than a background and some accents:
- The confidence bars in the findings panel run the full sweep, starting on the switch's cyan.
- Every clay card carries a 1px hairline of it along its top edge, at zero opacity until hover — the card catches the sheen as you pass.
- The lit switch sits inside a slowly turning conic ring of the same sweep, masked to a 2px annulus: the cyan core stays the signal, the ring is where the signal comes from.
- The button's bloom leaves cyan and lands on violet and magenta at its outer edge, the way the shader's bands do.
- Section numbers are the sweep, background-clipped to the text.

DESIGN SYSTEM (sampled from the artboard, not invented)
- Board #05070e, pill idle #0e1343, pill hover #181f77, idle label #8789a1, hover label #ffffff.
- The two arcs are the only accents: magenta #ff3b7f along the top, electric blue #3d6cff along the bottom, with #7a3bff between them in gradients.
- Surfaces: #0b1030 cards on the board, hairlines rgba(124,146,255,.14/.26), text #eef1ff, muted #8789a1.
- Every raised thing wears the pill's own edge: inset 0 1px 0 rgba(255,255,255,.07), inset 0 -1px 0 rgba(0,0,0,.5), then a deep ambient shadow and, when active, a blue bloom. Radius 999px for controls, 24px for cards.
- Nav pills, cohort tabs, chips and the FAQ signs are all CSS twins of the button: indigo fill, hairline, blue glow when active.

THE BUTTON COMPONENT — the part that takes care
The artboard paints its own near-black board and bakes the word "Button" into the pill, so it cannot be used as-is. Composite it instead:
1. Markup is a wrapper holding a <canvas> and an opaque HTML .face (a real <a>) carrying the label. The face covers the baked pill and its text; the arcs and glow live outside the pill, so they are all that shows.
2. The pill sits at x180 y225, 138x58 in the artboard. Measure the face, then stretch a layout frame past the canvas so exactly that rect lands on it: Fit.Fill, Alignment.TopLeft, with a crop inflated by 14px left/right and 28/22 top/bottom for the arcs. minX = -crop.x * scale, maxX = (500 - crop.x) * scale, same for Y, in drawing-surface pixels (multiply by devicePixelRatio after resizeDrawingSurfaceToCanvas). Size and offset the canvas from that same ratio, so one button component fits any label width.
3. The canvas is mix-blend-mode: screen, which makes the near-black board vanish on a dark page. Two traps, both worth stating: any ancestor that forms a stacking context (a GSAP transform, a z-index: 1 child) limits the blend to that context and the board paints as a grey rectangle — so clearProps the intro transform; and a backdrop-filtered surface isolates blending entirely, so the button in the glass header must be a CSS-only twin that draws the two arcs as glowing 1px lines instead. For the CTA band, put the buttons on a flat panel in the board's own colour, where the canvas rect is invisible whether it blends or not.
4. A global img/svg/canvas { max-width: 100% } will clamp the effect canvas — set max-width: none on it.
5. Give the switch a real job rather than a decorative one: it powers the scan overlay. Off slides the reveal split fully right so only the raw study is left, parks the drag handle and sets aria-disabled on it; on restores the split it was last read at.

HERO
- Sticky glass pill header: blurred surface at 60%, logo mark, pill nav that fills indigo when active, burger + sheet under 900px, and the CSS-twin CTA.
- In its own absolutely-positioned band (not the page, or it drifts into the sections below): two blurred radial glows in magenta and blue, a giant outlined "FUTURE MEDICINE", and a flowing data ribbon of five bezier strands in the arcs' colours with a blurred bloom, a white highlight strand and drifting motes. The strands draw themselves in with stroke-dasharray.
- Headline "AI-POWERED MEDICINE: (three inline-SVG portraits + a glowing DNA pill) REDEFINING HEALTHCARE", each word sliding up out of an overflow-hidden mask, then a CTA row: the lit pill, a ghost twin, and a quiet "No PHI leaves your VPC".
- A 100px badge with text on a circular path spinning at 18s (6s on hover), parked below the title so it never collides with the headline. A right-aligned numbered list with hairline rows and a magenta active dot.

SECTIONS
1. Trust: a masked, paused-on-hover marquee of invented care providers.
2. Numbers: four stats that count up on view (97.4%, 12min, 34%, 6 sites).
3. Capabilities: four cards with indigo icon tiles and a blue bloom on hover.
4. Image analysis — the centrepiece. A dark 16:10 stage holding two inline SVG renderings of the same simulated axial MRI slice: the raw study, and the model's view (blue tint, segmentation grid, attention heat, a dashed lesion contour, a 12.4mm measurement, leader-line callouts, a HUD confidence chip). Reveal the annotated layer with clip-path: inset(0 0 0 var(--split)) driven by a draggable divider — pointer capture anywhere on the stage, plus role="slider" with arrow/Home/End keys and aria-valuetext. Both halves share the same tissue texture so it reads as one image. Beside it, findings whose confidence bars fill on view in the blue→violet→magenta gradient, under "Confidence, not a diagnosis. A clinician signs every report."
5. Predictive analytics: an SVG chart drawn from JS data — grid, uncertainty band, gradient area and line, two dots, a magenta dashed alert threshold — with three cohort tabs that redraw it and re-run the line's stroke-dashoffset draw. Beside it three risk cards with colour-coded scores and the drivers behind each.
6. How it works: three numbered steps on a dashed connector.
7. A pull-quote card with an inline-SVG portrait.
8. Governance: four compliance cards.
9. FAQ: an accordion with rotating plus signs and height-animated panels (height → scrollHeight → auto so it stays responsive).
10. A CTA band with magenta and blue radial washes and the flat button console, then a four-column footer and a legal line.

MOTION
- One GSAP intro: header, glows, ribbon slide and strand draw, motes, outline text, headline words, CTA row, badge, list rows.
- Three nested wrappers on the ribbon — scroll scrub, float loop, pointer parallax — so no two tweens fight over one transform. Same discipline for the badge; pointer parallax only touches axes a float does not own.
- Clay cards tilt ±4° toward the cursor with a lift; the header CTA is magnetic; both skipped on coarse pointers.
- prefers-reduced-motion: reveals without travel, no intro, floats, parallax, tilt or marquee, and the switch and buttons change state without transitions.

DETAILS
- Nav pills follow the section in view via IntersectionObserver with a -45%/-50% root margin.
- .page uses overflow-x: clip — not hidden — so the ribbon can hang off the side without breaking the sticky header.
- Skip link, focus-visible rings, aria-expanded on the burger and accordion, no horizontal scroll at 390px.
- Make the brand fictional and say so: a legal line stating the company, figures, patients and studies are synthetic and not medical advice.
