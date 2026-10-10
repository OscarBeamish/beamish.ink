<!--
  The brief this page was built from, kept verbatim.

  Named brief.md, because prompt.md means something else here: that is
  the generated Beamish prompt, written into .generated/<slug>/.

  Written by Ray Velez for instalanding.ai and distributed with the page
  under the MIT licence.
-->

Build a single-file HTML landing page for "Prism", an evals platform for teams shipping LLMs, in the language of a fashion portfolio rather than a SaaS template — and with no photography anywhere. Asul, Cabin and Covered By Your Grace from Google Fonts, GSAP 3.12 + ScrollTrigger from a CDN, everything else inline. Make the brand obviously fictional and say so in the footer.

THE IMAGES ARE GENERATED, NOT SHOT
Every picture on this page — the hero panel, the run gallery, the floating cards, the wide banner, the quote avatars — is the same component at a different size:

- A CSS grid of cells. Each cell holds one absolutely positioned shape, centred on the cell, sized 100% or 200% (the oversize is the point: it bleeds into the neighbours), rotated by a quarter turn, given either no corner radius or a 100vw one, and coloured from a six-colour palette: #561ccd, #a169e9, #361bec, #100091, #fc7f0c, #e51263.
- Six shape variants: plain fill, two dotted variants (`radial-gradient(circle at center, var(--c1) 1px, transparent 1px, transparent 5px)` over a second colour at 10px), a 45° half-gradient, a full circle, and a twelve-point star via clip-path.
- Every shape is `mix-blend-mode: hard-light`, and the whole grid runs through an SVG gooey filter: `feGaussianBlur` at 12, then a `feColorMatrix` with an alpha row of `0 0 0 19 -9` to crush the blurred ramp back to a hard edge, then `feComposite ... operator="atop"`. That is what makes neighbouring shapes melt into each other instead of sitting side by side.
- Drive it all from CSS custom properties set in JS, so resampling is one loop over the cells. Resample on click, and let the hero resample itself on a slow beat while it is on screen.
- Two things to get right or it falls apart: scale the cell count with the element (the sketch is 6x6 in a 500px box, so a 1400px panel needs 12x12 or the melt disappears — the blur is in pixels), and position the injected grid off the `[data-goo]` attribute rather than one wrapper class, or half the hosts collapse to a zero-height grid.

DESIGN SYSTEM

- Palette: white page, black ink, #ff4081 accent, #f1f1f1 / #e5e5e5 / #6b6b6b greys. The nav is a full-bleed accent bar.
- Asul 700 uppercase for display at -0.04em tracking and 0.96 line-height; Cabin 14px uppercase at 0.14px tracking for every label; Covered By Your Grace in accent, 28px, for hand-written margin notes — they are the page's whole personality, so put them everywhere: rotated over the hero word, beside section titles, numbering the steps and the contact lines.
- Links are lowercase-to-uppercase text with a 1px rule under them and an arrow that slides 3px on hover.
- Primary CTAs are full-width black bars at 64px display type.

SECTIONS

1. Sticky accent nav: wordmark, centred links, a ruled CTA.
2. Hero: one giant word at `clamp(110px, 22vw, 340px)`, with five hand-written decorations absolutely positioned against it (one rotated -35°, one rotated -72° off its own bottom-left corner, a © and a year), and four corner meta blocks — label over value — pinned to the section's corners.
3. A ticker of capability phrases separated by 64px rules, duplicated and translated -50% on a 60s linear loop, paused on hover.
4. Hero panel: a square generative composition with an 8x8 white rule grid over it, ten cells of which are lit accent at 60% with multiply blending. A note in the corner tells you it resamples on click.
5. About: a centred statement in display caps with hand notes around it, and three generative cards behind it at different parallax speeds.
6. Run gallery: rows of tiles at 3:4, 1:1 and 4:3, each with a max-width and a top padding so the row staggers vertically, captioned with a date right-aligned under it.
7. Platform: a black band, three cards rotated -6°, 10° and 3° and overlapped by -64px, each with an accent line icon.
8. A wide generative banner, then a second ticker at display size with accent blocks between phrases.
9. Process: three numbered steps with hand-written numerals, over floating generative cards that bob on a sine loop.
10. Quotes: a card slider — a centre card, two ghost cards behind it at 0.5 opacity, scaled 0.75 and rotated ±5°, prev/next buttons, and a generative avatar in every card.
11. Contact: a two-column block, one side a list of commands numbered by hand, the other a full-bleed composition with a black button on top. Then a footer with link columns and a legal bar.

MOTION
GSAP with one data attribute per behaviour: nav drop, a hero timeline (word up, decorations popping with back.out, meta fading), a random-order stagger on the 64 grid cells, reveal/photo/hand/card-pop batches on ScrollTrigger, a sine bob on the floats and scrubbed parallax on the about cards. Give floats and parallax separate wrappers so no two tweens write the same transform.

RESPONSIVE
At 1024px the centre nav, the about cards, the process floats and the ghost quote cards all drop out and the card rotations flatten. At 720px the hero meta becomes a two-column grid above the word, the run rows wrap to two per line, and the quote card fits the viewport. Respect prefers-reduced-motion: no tickers, no bobbing, no slider animation.
