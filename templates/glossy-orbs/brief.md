<!--
  The brief this page was built from, kept verbatim.

  Named brief.md, because prompt.md means something else here: that is
  the generated Beamish prompt, written into .generated/<slug>/.

  Written by Ray Velez for instalanding.ai and distributed with the page
  under the MIT licence.
-->

Build a single-file HTML landing page for "Monax", an analytics platform for business teams. Inter 300–900 from Google Fonts, GSAP 3.12 + ScrollTrigger from CDN, everything else inline. Every visual is CSS, inline SVG or a WebGL shader, so the page fetches no image assets at all — draw the avatars too, as gradient discs with an inline person glyph.

DESIGN SYSTEM
- Warm paper palette: --bg #efede8, --bg-2 #e5e2da, --ink #0d0d10, --ink-soft #2a2a2d, --mute #8a8780, --line #dad6c9, --green #bfd58f, --green-dark #5c7838. Body is a radial gradient from #f4f1ec to #dfdbcf, with a fixed SVG fractal-noise grain overlay at 5% opacity, multiply blend.
- Depth comes from layered shadows: a long soft drop, a tight contact shadow, a 1px inset top highlight and an inset bottom shade. Keep them as tokens (--shadow-card, --shadow-soft, --shadow-pill, --shadow-dark).
- "Glossy orbs" are the illustration language: radial-gradient spheres (coral, green, purple, blue, sand, red, gold) with a white highlight at 30% 25% via ::after.
- Type: 800-weight headlines with -0.03 to -0.045em tracking; small uppercase eyebrows at 0.28em tracking with a green dot; uppercase underlined "read more" links.
- Black pill buttons with inset highlights; 26–28px card radii; cubic-bezier(0.6, 0, 0.2, 1) hover lifts.

SECTIONS
1. Fixed blurred nav: wordmark, centered links with chevrons (anchors to sections), a black "Contact us" pill.
2. Hero: a 3-line 8vw headline, "Business Teams / Around / Analytical Work". Each word sits in an overflow-hidden mask and slides up from 105%. Line 2 has a dithered pill image before the word and a green "Behind every great idea" pill with a spinning glossy leaf after it.
3. Fanned card stack, directly under the headline and the centrepiece of the page. Eight cards of different sizes sit on a stage as absolutely positioned slots, each carrying its own --w, --h, --y, --z plus data-rot and data-depth, overlapping like a hand of cards held out: a coral "Freshness / Live" chip, a green "$4.2M Revenue" KPI, a dark "Connect / 6 sources synced" card holding the holographic M hub, a gold "Regions / EMEA up 32%" bar card, a tall dithered "Live dashboard / 3 viewing" panel, a blue "2.3% Churn" donut, a sand "Ask Monax / answered in 0.8s" card with a question bubble and an avatar row, and a red "Alerts / 3 new today" card. Behind the whole stack the words "real answers" sit as huge letterspaced ghost type. A "Try for free" pill closes the section.
4. Logo marquee of text wordmarks in mixed weights with small glossy orbs, CSS loop, edge mask.
5. Product demo: a tablist (Connect / Ask / Share) beside a mock app window. Connect shows 6 source chips wired to a pulsing "M" hub with animated dashed SVG lines. Ask shows a chat question, an AI answer and 4 bars that grow. Share shows KPI tiles and an area line chart revealed with a clip-path wipe, plus live viewer avatars. Tabs auto-advance every 6s with a progress bar, pause on hover or offscreen, and stop for good once the user picks one. Arrow keys work.
6. Bento: a dark 2×2 tile with an isometric stack of three glossy slabs (Sources / Models / Metrics) that slowly rotates and fans apart on hover (GSAP tweening CSS variables); a 200+ connector counter; "Governed by default" with a lock tile; and a Slack-style alert feed that reorders itself every few seconds with a manual FLIP animation.
7. Customer stories: a holographic art panel beside a quote card with author, metric chip, a 01 / 03 counter and prev/next round buttons. Moving slides swaps the panel's glyph to the new company's initial behind a quick scale-out / back.out scale-in.
8. Pricing: Starter / Team (dark, "Most popular") / Enterprise, with a monthly/annual switch that tweens the price 49 → 39 and green check bullets.
9. Resources: 3 cards whose thumbnails are small holographic scenes - a stepped stack, a question glyph, a talk bubble with a waveform - that zoom on hover.
10. Footer with a newsletter input pill, 4 link columns, a giant fading wordmark, the fictional-product disclaimer and a live "All systems normal" status.

DITHERED FIELD (a material, not a background)
The page background stays the paper gradient. What gets replaced is the fill of three surfaces: the pill image inline in the headline, the tall "Live dashboard" card in the fan, and the sand "Ask Monax" card next to it. Each one gets a WebGL canvas laid into it, written in plain WebGL in a script tag -- no framework, no npm, no ogl. One full-screen triangle, one fragment shader, driven per element by data attributes (data-fx-ink, data-fx-paper, data-fx-coverage, data-fx-scale, data-fx-density):
- Rotated fbm noise drives a dot grid; each cell prints a 5x5 dot whose radius falls off from its center, so the field reads as a printed halftone rather than pixels. Add a scanline bar, a rare horizontal glitch displacement, a flicker term and a slight barrel curvature.
- Do not tint it one color. Mix four inks along a slow diagonal that drifts with time, taken from the gradient that element used to have -- violet #8163c6, amber #f2a03b, red #e83a4d and blue #7bafce on the headline pill and the dashboard card, over paper #f2ece0 / #e8e0ce / #c8b89e; tan #c99368, gold #e0a82e, umber #8a7050 and cream #f8d6a6 on the sand card. Give each host its own coverage and density through data-fx-coverage and data-fx-density, so the small inline pill prints coarser than the card it sits beside. Print them onto that element's own base gradient, rebuilt in shader, and dither last in paper space so the banding goes with the dot edges.
- Compute the cell grid from the element's aspect (aspect x 15 columns, 15 rows) so dots stay square in a wide card and a tall one alike. The pointer nudges intensity through an exponential falloff with a ripple, smoothed at 0.08.
Wiring: the canvas is the host's first child at z-index -1, and the host gets position relative plus isolation isolate -- that gives it a stacking context of its own, so the layer sits above the element's background and below its ::before/::after gloss and every child, spheres and orbs included, with no way to escape behind the section. The element keeps its CSS gradient, which is then the automatic fallback when WebGL is missing or the shader fails to compile. Cap DPR at 1.5, skip offscreen panels with an IntersectionObserver, skip frames while document.hidden, and under prefers-reduced-motion render a fully formed field at a fixed time then stop.

HOLOGRAPHIC SCENES (the other material)
Where the dithered field is print, this is glass. One recipe, reused three times: a dark rounded panel, a 1px green outline, and a glyph drawn three times at different depths -- a back, a mid and a front layer sharing a --gap that sets how far apart they sit in Z, each outlined with -webkit-text-stroke and filled with a clipped gradient rather than a solid color, the whole group on a slow CSS wobble in 3D. It fills the "Connect" card in the fan (an M), the customer-stories art panel (the current company's initial), and the three resource thumbnails (a stepped stack, a question mark, a talk bubble with a waveform). Hovering the bento's layers tile tweens --gap from 36px out to 64px on back.out and back on elastic.out, so the depth spreads under the pointer.

MOTION
- Intro timeline: nav drops, words slide up line by line, pills pop with back.out. Then the ghost letters rise and the fan cards drop in from above, centre card first and outward, and only once every card has landed does the idle float start - otherwise the drop and the float fight over the same transform.
- Infinite sine yoyo bobs on the pills and the fan cards; mouse parallax on the fan slots through the CSS translate property, kept off GSAP's transform so the two never collide; hovering a card tilts its face toward the pointer and lifts it above its neighbours; on scroll the outer cards fan further out, the ghost phrase swells and fades, and the headline letters spread slightly.
- Sections reveal with ScrollTrigger.batch (y 40 → 0, once) using clearProps: "transform" so CSS hover lifts keep working. Never put two ScrollTriggered tweens on the same element's transform, and give scroll-driven sphere motion yPercent so it doesn't fight the y bob.

RESPONSIVE
At 1000px columns stack and the bento goes to 2 columns. At 700px everything is 1 column, the headline lines wrap, nav links hide, and there's no horizontal overflow. Respect prefers-reduced-motion.
