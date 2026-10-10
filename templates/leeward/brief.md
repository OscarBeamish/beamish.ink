<!--
  The brief this page was built from, kept verbatim.

  Named brief.md, because prompt.md means something else here: that is
  the generated Beamish prompt, written into .generated/<slug>/.

  Written by Ray Velez for instalanding.ai and distributed with the page
  under the MIT licence.
-->

Build a single-file HTML landing page for "Drift", a weather-routing platform for ocean fleets, around a live WebGL wind field. Bebas Neue + DM Mono from Google Fonts, raw WebGL in a script tag — no framework, no npm, no build step. Every other visual is CSS. Make the brand obviously fictional and say so in the footer.

THE FIELD (build this first; the whole page is drawn in its language)
A flow-field hero: 14,000 particles advected through the sum of six pressure vortices, drawn as GL line segments.
- Each system is { x, y, spin, r, strength }. Its contribution at a point is a tangential vector of magnitude `strength * (d/r) * exp(-d² / 2r²) * gain`, plus a radial inflow term of `-spin * 0.32 * mag` so lows draw in and highs push out. Sum the systems over a background flow (bgU, bgV).
- Precompute the field into a Float32 grid at one cell per 28px and refresh ONE row per frame, round-robin — the systems drift, so a fully recomputed field every frame is wasted work.
- Particles: bilinear-sample the field, step by `u * dt * flowSpeed`, respawn on death or when they leave the box. Ages and lifetimes are random so nothing pulses in sync.
- Draw into a ping-ponged framebuffer pair: each frame, blit the previous texture through a shader that mixes it 7% toward the background, then draw this frame's segments over it, then blit the result to the canvas and swap. The trails ARE the fade; never clear.
- Colour by speed: 8-stop palette, interpolate between stops on `speed² * gain`, alpha 0.54, additive-free SRC_ALPHA blending. Three palettes (marine, mistral, sirocco) so presets can re-tint the whole field.
- Cap DPR at 1 and the step at 30fps; the framebuffer trails carry the motion, not the frame rate.
- Overlay the systems as DOM markers: three concentric hairline rings at 0.72 / 1.18 / 1.72 scale with falling opacity, and a 1.8rem square-in-circle label reading L or H, moved with translate3d and smoothed toward the system's position at 0.12 so the marker lags the field slightly.

PRESETS
Six named fields — summer calm, levante, mistral, tramontana, sirocco, winter storm — each with its own palette, background colour, flow speed, field gain, background flow, wander and six systems. Switching one eases the systems toward their new targets rather than teleporting them, re-tints the legend, and clears the trail buffers so the new field draws clean.

DESIGN SYSTEM (everything else inherits from the field)
- Tokens: --bg #0d141a, --paper #f0ece3, --muted #a3b0b8, --low #e0896a, --high #6a9fe0. Bebas Neue for display, DM Mono 300 for everything else — including every number, endpoint and label.
- Use CSS layers (reset, base, layout, ui) and logical properties (inline-size, inset-block-start, margin-block) throughout. color-mix(in oklab, ...) for every tint, so one --paper drives all the hairlines.
- ONE rule weight: 1px hairlines at 16% paper, 34% for emphasis. No shadows, no radii, no fills — the page is drawn, not boxed.

BUTTONS AND CARDS (the broken frame)
Adapted from the Uiverse "fancy" button by cssbuttons-io, inverted for a dark page. Build the button once and let the cards be the same idea at card scale.
- The button is a square 2px frame, no radius, with a dash before the label: an absolutely positioned 1.5625rem x 2px bar at 1.5em from the left, vertically centred.
- Three "keys" punch gaps in the frame: one 1.5625rem bar at top -2px / left 0.625rem, and two at bottom -2px — 1.5625rem at right 1.875rem and 0.625rem at right 0.625rem. Paint them in the surface BEHIND the element, not in a fixed colour: put that colour in a variable each section sets, or the gaps stop being gaps the moment a band changes tone.
- Hover and focus-visible fill the button with paper, invert the label and the dash, shrink the dash from 1.5625rem to 0.9375rem, slide the label 0.5rem left, and close all three keys (width 0, pulled to the frame's corners) on a slower 0.5s ease-out than the 0.3s everything else runs at — the frame heals after the fill lands.
- Set the label's inset in rem, not em: the label is a small mono caps, and 2em of it lands the glyphs under the dash.
- The solid twin starts filled and empties on hover, so a pair still reads as primary and secondary.
- Cards (panels, preset cards) take the same 2px frame with two keys — top-left and bottom-right — that close on hover with a 6% paper wash. Two, not three: a card is wide enough that a third gap reads as damage rather than drawing.
- An 84px grid, ghosted over the field at 50% and over every section at 12%, as repeating-linear-gradients.
- Microcopy is lowercase mono at 0.55rem with 0.2em tracking; headings are Bebas at 0.86 line-height.

SECTIONS
1. Sticky hairline bar: wordmark, mono links, a ghost CTA.
2. Hero = the field, sized to the viewport minus the measured nav height. Over it: a caption block (title + "l = low pressure · h = high pressure · <mode>"), the headline and CTAs, the speed legend bottom left and the six preset buttons bottom right. The field is dense, so put a scrim behind the copy — a wash down the reading column and another under the instrument row, both inside the hero's own stacking context so they sit over the canvas and under every word.
3. Readout strip: four hairline-divided stats, counters counting up when they scroll in.
4. "The model": three plates, each a hairline figure of a pressure system (reuse the ring markup, with the ring opacities raised since a static figure has to carry the drawing) over a masked hatch of repeating lines, with a ruled caption bar underneath.
5. Live board: a mono table of voyages where the wind column is a swatch pulled from the same palette the legend shows, and ETA deltas are tinted with --high and --low.
6. Presets: six cards built FROM the preset objects — label, blurb, a gradient bar of that palette, and its flow/gain numbers. Clicking one drives the hero field and scrolls back to it.
7. API: a two-column block with a syntax-tinted request/response plate.
8. Pricing: three hairline panels, the middle one filled at 7% paper.
9. Access: an email form that validates natively and sends nothing, beside a details/summary FAQ with + and – markers.
10. Footer: link columns, a giant ghosted wordmark at 10% paper, and a legal bar with the current year.

BEHAVIOUR
- Pause the field when the hero leaves the viewport (IntersectionObserver) and when the tab hides; 14,000 particles are not worth simulating off screen.
- Drop the particle count to ~5,200 under 760px.
- If getContext("webgl") returns null, swap the canvas for a CSS pressure gradient and keep the presets driving the legend and the label — the page must not depend on WebGL, and must never throw.
- Handle webglcontextlost / restored.
- Under prefers-reduced-motion, run the field long enough to build its trails (about 40 frames) and then hold that frame.

RESPONSIVE
Under 62rem the grids go to two columns and the readout wraps. Under 46rem the nav links hide, grids go single column and the preset row left-aligns. Under 820px of HEIGHT the hero compresses its type and drops the lede, so the legend and presets stay above the fold.
