<!--
  The brief this page was built from, kept verbatim.

  Named brief.md, because prompt.md means something else here: that is
  the generated Beamish prompt, written into .generated/<slug>/.

  Written by Ray Velez for instalanding.ai and distributed with the page
  under the MIT licence.
-->

Build a single-file HTML landing page for a developer platform — a dermatology imaging API — in a soft 3D "clay" / neumorphic style. Inter and JetBrains Mono from Google Fonts, GSAP 3.12 + ScrollTrigger from CDN, everything else inline. No image files at all: every visual is CSS or inline SVG.

DESIGN SYSTEM
- Palette: #e6e9ee page gray, #ffffff panel, #0e1116 text, #667085 muted, #0a0d12 clay dark, #f0f2f5 clay light, and one electric accent defined as a hue token (--accent-hue: 214deg) so buttons, meters, chips and glows all resolve from it. Alternate gray and white sections.
- Four shadow tokens as CSS variables: --shadow-light, --shadow-dark, --shadow-orange (the accent one), --shadow-glass. Each combines an outer drop shadow, an opposite-corner highlight and two inset highlights. Inset-well surfaces use only the inset pair.
- Type: headlines weight 500, clamp(32px, 4vw, 56px), -2px tracking, 1.05 line-height, second line in muted gray. Mono for every number, version, endpoint and label. Section labels are a 6px dot + 13px semibold text.
- Shapes: 24–40px radii, springy cubic-bezier(0.175, 0.885, 0.32, 1.275) hover lifts.
- "Element tiles": 36px rounded squares with a two-letter symbol (Img, Seg, Cls, Fhr…) and a tiny index in the corner, like a periodic table — used for capabilities and SDKs.

THE BUTTON (the page's anchor; build this first and let it set the accent)
A glossy dark pill that looks lit from inside, adapted from the Uiverse button by dexter-st.
- Structure: a relative, isolated .btn-wrapper holding the button, an inline sparkles SVG, and a label wrapper with two absolutely positioned labels — the idle one ("Generate") and the busy one ("Generating").
- The face is #10141b with five stacked inset white highlights (1/2/4/8/16px, falling opacity) and five upward black drop shadows at the same scale. 1px #fff2 border, 24px radius.
- ::before is a plate inset -4px behind it at z-index -1 carrying a 0deg #0004→#000a gradient and the hover/active glow; ::after is a sheen gradient from #fff through hsl(hue,100%,70%) to transparent, opacity 0 at rest. The wrapper MUST isolate, or that -1 plate slips behind whatever card the button sits on.
- Every letter is its own span, animated by a 2s flicker with an 0.08s delay per letter, so the label shimmers. Split the label in JS from plain text rather than shipping spans, so the label is still readable if the script never runs — and do not put word-spacing: -1em on the label, or multi-word labels run together.
- On focus (and on a click-applied .is-busy class, because iOS does not focus buttons on tap) the labels swap, the letters blur and scale once, the plate lights with the accent and the sheen comes up to 0.6. Hover lights the border and the icon; active drives all of it to full.
- Everything else on the page takes its accent from the same hue token.

SECTIONS
1. Fixed header with mix-blend-mode: exclusion so it inverts over light and dark sections: logo + wordmark, 6 centered nav links that smooth-scroll, a mono version readout, pill MENU button. Nothing glassy in here — the blend mode turns a frosted pill inside out and a green dot magenta.
2. Hero (100vh), two columns: left is just the three-line headline, whose last line is the accent, and the generate button beside a frosted ghost button. No status pill, no version and compliance row, no spec chips - the console on the right already carries the numbers, and a second set under the copy only reads as filler. Right is a "console": a dark slab with three window dots, a mono endpoint + latency, a syntax-coloured curl block, and three result tiles with accent meters. Behind it all, a 26vw background wordmark clipped to a white-to-transparent gradient.
3. About panel: white, 40px top radii, pulled up 30px over the hero; faint CSS wireframe globe; statement headline + social row; four giant 120px clay pills (white / accent / black arrow / inset gray) reading Ship · In · → · Days.
4. SDK marquee: two duplicated tracks of clay chips (element tile + language) scrolling infinitely in pure CSS, edge-faded with mask-image, paused on hover.
5. Modules: 4 cards on clay-light with inset "stage" wells holding CSS-drawn matte-black module slabs tilted a few degrees — an accent rail, a mono name, a face with two progress bars and a row of pins. Each card has a category badge, name, capability element tiles, a mono version line and a round "+" that toggles to an accent ✓ and flips its aria-label between Enable and Disable.
6. How it works: 4 numbered step cards with dark clay icon tiles (last one accent) under a thin track whose accent fill scrubs with scroll; then a dark clay stats panel with an accent radial glow and counters that count up (uptime stays static text, since a percentage does not count).
7. Pipelines: accessible tablist of glass pills (active = dark clay, arrow-key navigation) for 5 workloads. The panel shows a white summary card (accent kicker, big title, description, module chips) beside inset rows for IN, RUN and OUT — each an endpoint, a service and a one-line note. Switching crossfades with GSAP. Add a note that it is illustrative and the product is fictional.
8. Customers: 3 quote cards, the middle one dark clay and offset 40px down, each led by a mono metric chip rather than stars.
9. Developer FAQ: sticky intro with the generate button beside an accordion of white clay rows; the + icon rotates into a dark ×, and answers expand with a grid-template-rows 0fr→1fr transition. One open at a time. Ask the questions engineers actually ask: auth, rate limits, data residency, self-hosting, SLA.
10. Sandbox CTA: dark clay card with an accent glow and a frosted form (work email + pipeline select, inset dark fields) submitting with the same generate button. Validate natively, latch the button into its busy state, show a success line; send nothing.
11. Footer: gray panel with 40px top radii overlapping the section above; brand, three link columns, a giant gradient wordmark sized to fit the viewport, and a legal bar with the current year.

MOTION (GSAP)
- Hero entrance timeline: nav drops in, wordmark scales up from 0.9, the console rises 100px, hero copy staggers in from the left.
- Press Start 2P is a full-width face, so a headline in it sets its own measure: size the hero column to whatever the longest authored line needs, or the line wraps and three become four. On a phone the clamp floor is the trap - a fixed floor that fits a 390 screen runs off a 360 one, so below 420px track the viewport instead and pick the coefficient so it meets the floor at the breakpoint and there is no step.
- Continuous yoyo sine.inOut floats on the pills and module slabs. Never put a float and a scrubbed parallax on the same element's y — they fight over the transform and the element ends up dozens of pixels off.
- Parallax: wordmark -150px, console +50px / scale 0.95, both scrubbed.
- Every later section uses ScrollTrigger.batch reveals (y 40 → 0, stagger 0.12, once) with clearProps: "transform". A `once` batch only fires for elements that cross its start while you watch, so arriving mid-page by anchor or restored scroll leaves whole sections at opacity 0 — reveal anything already on screen outright, and re-check on ScrollTrigger's refresh and scrollEnd events.

RESPONSIVE
At 1100px the hero stacks and drops its fixed height. At 1024px grids go to 2 columns, section heads stack, the header drops its blend mode for a solid blurred bar, and the center nav hides. At 760px the header's version readout hides. At 640px everything is 1 column with 20px gutters and no horizontal overflow.
